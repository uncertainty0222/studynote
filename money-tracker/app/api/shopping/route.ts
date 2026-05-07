import { getAuthUser } from '@/lib/auth';
import { getShoppingItems, createShoppingItem } from '@/lib/db';
import { broadcastUpdate } from '@/lib/broadcast';
import { sendPushToRole } from '@/lib/push';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const items = await getShoppingItems();
  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await request.json();
  if (!name?.trim()) return Response.json({ error: '이름을 입력해주세요' }, { status: 400 });

  const item = await createShoppingItem(name.trim(), user.role);

  broadcastUpdate();
  const partnerRole: 'husband' | 'wife' = user.role === 'husband' ? 'wife' : 'husband';
  const senderName = user.role === 'husband' ? '남편' : '아내';
  sendPushToRole(partnerRole, '🛒 장보기', `${senderName}이(가) 추가했어요: ${name.trim()}`).catch(() => {});

  return Response.json(item, { status: 201 });
}
