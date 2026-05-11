import { getAuthUser } from '@/lib/auth';
import { createPersonalIncome } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Entry {
  date?: string;
  amount?: number | string;
  currency?: string;
  category?: string;
  description?: string;
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { entries?: Entry[] };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const entries = body.entries;
  if (!Array.isArray(entries)) return Response.json({ error: 'entries must be an array' }, { status: 400 });
  if (entries.length === 0)   return Response.json({ error: 'entries is empty' }, { status: 400 });
  if (entries.length > 1000)  return Response.json({ error: 'too many entries (max 1000)' }, { status: 400 });

  const errors: string[] = [];
  let inserted = 0;
  for (let idx = 0; idx < entries.length; idx++) {
    const e = entries[idx];
    if (e.amount === undefined || e.amount === null || e.amount === '' || !e.category || !e.date) {
      errors.push(`row ${idx + 1}: 필수 항목 누락 (date/amount/category)`);
      continue;
    }
    const amount = Math.round(Number(e.amount));
    if (Number.isNaN(amount)) { errors.push(`row ${idx + 1}: amount 숫자 변환 실패`); continue; }
    try {
      await createPersonalIncome({
        amount,
        currency: e.currency || 'USD',
        category: e.category,
        description: e.description ?? '',
        date: e.date,
      });
      inserted++;
    } catch (err) {
      errors.push(`row ${idx + 1}: ${(err as Error).message ?? 'DB 오류'}`);
    }
  }
  return Response.json({ inserted, errors });
}
