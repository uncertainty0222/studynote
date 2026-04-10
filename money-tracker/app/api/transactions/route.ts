import { getAuthUser } from '@/lib/auth';
import { getTransactions, createTransaction, getBalance, getPendingCountForRole } from '@/lib/db';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [transactions, balance, pendingCount] = await Promise.all([
    getTransactions(),
    getBalance(),
    getPendingCountForRole(user.role),
  ]);

  return Response.json({ transactions, balance, pendingCount });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { payer, amount, memo, date } = await request.json();

  if (!payer || !['husband', 'wife'].includes(payer)) {
    return Response.json({ error: '지불자를 선택해주세요' }, { status: 400 });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return Response.json({ error: '올바른 금액을 입력해주세요' }, { status: 400 });
  }
  if (!memo?.trim()) {
    return Response.json({ error: '내용을 입력해주세요' }, { status: 400 });
  }
  if (!date) {
    return Response.json({ error: '날짜를 선택해주세요' }, { status: 400 });
  }

  const transaction = await createTransaction({
    payer,
    amount: Math.round(Number(amount)),
    memo: memo.trim(),
    date,
    created_by: user.role,
  });

  return Response.json(transaction, { status: 201 });
}
