import { getAuthUser } from '@/lib/auth';
import { getPersonalExpenses, createPersonalExpense } from '@/lib/db';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const items = await getPersonalExpenses();
  // strip receipt_image from list to reduce payload
  return Response.json({ items: items.map(({ receipt_image: _, ...i }) => i) });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { amount, currency, category, merchant, description, date, receipt_image, items } = await request.json();
  if (!amount || !category || !date) return Response.json({ error: '필수 항목을 입력해주세요' }, { status: 400 });
  const expense = await createPersonalExpense({
    amount: Math.round(Number(amount)), currency: currency || 'VND', category,
    merchant: merchant || '', description: description || '', date,
    receipt_image: receipt_image || null, items: items || null,
  });
  return Response.json(expense, { status: 201 });
}
