import { getAuthUser } from '@/lib/auth';
import { getConfigValue, setConfigValue } from '@/lib/db';
import { parseWorkSheet, isPublishedSheetCsvUrl, type WorkYear } from '@/lib/workIncome';

export const dynamic = 'force-dynamic';

const URL_KEY = 'work_sheet_csv_url';
const LAST_GOOD_KEY = 'work_income_last_good';
const CACHE_MS = 5 * 60 * 1000;

let memo: { url: string; at: number; years: WorkYear[] } | null = null;

async function fetchYears(url: string): Promise<WorkYear[]> {
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  if (!res.ok) throw new Error(`시트를 불러오지 못했어요 (HTTP ${res.status})`);
  const years = parseWorkSheet(await res.text());
  if (years.length === 0) throw new Error('시트에서 연도/월 데이터를 찾지 못했어요. 워크 앤 라이프 탭을 게시했는지 확인해주세요.');
  return years;
}

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = await getConfigValue(URL_KEY);
  if (!url) return Response.json({ configured: false });

  const refresh = new URL(request.url).searchParams.get('refresh') === '1';
  if (!refresh && memo && memo.url === url && Date.now() - memo.at < CACHE_MS) {
    return Response.json({ configured: true, years: memo.years, fetchedAt: new Date(memo.at).toISOString() });
  }

  try {
    const years = await fetchYears(url);
    memo = { url, at: Date.now(), years };
    await setConfigValue(LAST_GOOD_KEY, JSON.stringify({ years, at: memo.at })).catch(() => {});
    return Response.json({ configured: true, years, fetchedAt: new Date(memo.at).toISOString() });
  } catch (e) {
    const cached = await getConfigValue(LAST_GOOD_KEY).catch(() => null);
    if (cached) {
      const { years, at } = JSON.parse(cached) as { years: WorkYear[]; at: number };
      return Response.json({ configured: true, years, fetchedAt: new Date(at).toISOString(), stale: true, error: String((e as Error).message ?? e) });
    }
    return Response.json({ configured: true, error: String((e as Error).message ?? e) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { url } = await request.json() as { url?: string };
  const trimmed = (url ?? '').trim();
  if (!isPublishedSheetCsvUrl(trimmed)) {
    return Response.json({ error: '구글 시트 "웹에 게시 → CSV" 링크를 붙여주세요 (docs.google.com/... output=csv)' }, { status: 400 });
  }
  try {
    const years = await fetchYears(trimmed);
    await setConfigValue(URL_KEY, trimmed);
    memo = { url: trimmed, at: Date.now(), years };
    await setConfigValue(LAST_GOOD_KEY, JSON.stringify({ years, at: memo.at })).catch(() => {});
    return Response.json({ configured: true, years, fetchedAt: new Date(memo.at).toISOString() });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}
