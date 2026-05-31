import { runWatch } from '@/lib/breakoutWatch';

export const dynamic = 'force-dynamic';

// HaxKai 돌파 워처 cron 엔드포인트.
// 외부 cron(cron-job.org 등)이 주기적으로 호출한다. 봉 마감 직후 한 번이면 충분하므로
// 1D 기준이면 매시 정각 정도로 충분하다(중복 알림은 lib에서 방지).
//
// 보호: Authorization: Bearer <CRON_SECRET> 헤더 또는 ?key=<CRON_SECRET> 쿼리.
// (세션 쿠키가 아닌 공유 시크릿 — cron 호출자는 로그인 세션이 없으므로.)

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 시크릿 미설정 시 항상 차단
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get('key') === secret;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const results = await runWatch();
    return Response.json({ ok: true, checkedAt: new Date().toISOString(), results });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// cron 호출자에 따라 GET/POST 둘 다 허용
export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
