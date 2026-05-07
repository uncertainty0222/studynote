import { getAuthUser } from '@/lib/auth';
import { getPersonalIncome, createPersonalIncome } from '@/lib/db';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const items = await getPersonalIncome();
  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { amount, currency, category, description, date } = await request.json();
  if (!amount || !category || !date) return Response.json({ error: '필수 항목을 입력해주세요' }, { status: 400 });
  const item = await createPersonalIncome({ amount: Math.round(Number(amount)), currency: currency || 'VND', category, description: description || '', date });
  return Response.json(item, { status: 201 });
}
