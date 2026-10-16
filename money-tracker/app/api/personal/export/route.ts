import { getAuthUser } from '@/lib/auth';
import { getPersonalIncome, getPersonalExpenses } from '@/lib/db';

export const dynamic = 'force-dynamic';

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [income, expenses] = await Promise.all([getPersonalIncome(), getPersonalExpenses()]);

  const header = ['구분', '날짜', '금액', '통화', '카테고리', '가맹점', '설명', '품목', '등록시각'];
  const rows: unknown[][] = [
    ...income.map(i => ['수입', i.date, i.amount, i.currency, i.category, '', i.description, '', i.created_at]),
    ...expenses.map(e => [
      '지출', e.date, e.amount, e.currency, e.category, e.merchant, e.description,
      (e.items ?? []).map(it => `${it.name} ${it.price}`).join(' / '),
      e.created_at,
    ]),
  ].sort((a, b) => String(b[1]).localeCompare(String(a[1])));

  // BOM so Excel opens Korean text correctly.
  const csv = '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="income-expenses-${stamp}.csv"`,
    },
  });
}
