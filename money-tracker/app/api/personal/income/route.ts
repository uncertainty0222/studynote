import { getAuthUser } from '@/lib/auth';
import { getPersonalIncome, createPersonalIncome } from '@/lib/db';
import { sendPushToRole } from '@/lib/push';

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

  const amtStr = currency === 'VND' ? `₫${Math.round(Number(amount) / 1000).toLocaleString()}k`
    : currency === 'KRW' ? `₩${Math.round(Number(amount)).toLocaleString()}`
    : `$${Math.round(Number(amount)).toLocaleString()}`;
  const catLabel = category === 'TOUR' || category === '투어' ? 'TOUR' : category === 'COIN' || category === '투자수익' ? 'COIN' : '기타';
  const notifyRole: 'husband' | 'wife' = user.role === 'husband' ? 'wife' : 'husband';
  sendPushToRole(notifyRole, '💰 새 수익 등록!', `${catLabel} · ${amtStr}${description ? ' · ' + description : ''}`).catch(() => {});
  sendPushToRole(user.role as 'husband' | 'wife', '💰 수익 등록 완료', `${catLabel} · ${amtStr}${description ? ' · ' + description : ''}`).catch(() => {});

  return Response.json(item, { status: 201 });
}
