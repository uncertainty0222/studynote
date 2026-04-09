import { getTransactions, createTransaction, getTransactionCount } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '50');
  const offset = (page - 1) * limit;

  const transactions = getTransactions(limit, offset);
  const total = getTransactionCount();

  return Response.json({ transactions, total, page, limit });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { payer, amount, memo, date } = body;

  if (!payer || !['husband', 'wife'].includes(payer)) {
    return Response.json({ error: '지불자를 선택해주세요' }, { status: 400 });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return Response.json({ error: '올바른 금액을 입력해주세요' }, { status: 400 });
  }
  if (!memo || memo.trim() === '') {
    return Response.json({ error: '메모를 입력해주세요' }, { status: 400 });
  }
  if (!date) {
    return Response.json({ error: '날짜를 선택해주세요' }, { status: 400 });
  }

  const transaction = createTransaction({
    payer,
    amount: Math.round(Number(amount)),
    memo: memo.trim(),
    date,
  });

  return Response.json(transaction, { status: 201 });
}
