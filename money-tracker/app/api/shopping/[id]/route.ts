import { getAuthUser } from '@/lib/auth';
import { checkShoppingItem, uncheckShoppingItem, deleteShoppingItem } from '@/lib/db';
import { broadcastUpdate } from '@/lib/broadcast';
import { sendPushToRole } from '@/lib/push';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return Response.json({ error: '잘못된 ID' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const { action, memo = '' } = body as { action?: string; memo?: string };

  let item;
  if (action === 'uncheck') {
    item = await uncheckShoppingItem(numId);
  } else {
    item = await checkShoppingItem(numId, user.role, memo);
  }
  if (!item) return Response.json({ error: '항목을 찾을 수 없습니다' }, { status: 404 });

  broadcastUpdate();
  if (item.status === 'bought') {
    const partnerRole: 'husband' | 'wife' = user.role === 'husband' ? 'wife' : 'husband';
    const buyerName = user.role === 'husband' ? '남편' : '아내';
    sendPushToRole(partnerRole, '🛒 장보기 ✅', `${buyerName}이(가) 구매했어요: ${item.name}`).catch(() => {});
  }

  return Response.json(item);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return Response.json({ error: '잘못된 ID' }, { status: 400 });

  await deleteShoppingItem(numId);
  broadcastUpdate();
  return Response.json({ success: true });
}
