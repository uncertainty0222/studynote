import { getAuthUser } from '@/lib/auth';
import { getTransactionById, createDeletionRequest, approveTransaction, rejectTransaction } from '@/lib/db';
import { broadcastUpdate } from '@/lib/broadcast';
import { sendPushToRole } from '@/lib/push';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return Response.json({ error: '잘못된 ID입니다' }, { status: 400 });

  const tx = await getTransactionById(numId);
  if (!tx) return Response.json({ error: '거래를 찾을 수 없습니다' }, { status: 404 });

  const req = await createDeletionRequest(numId, user.role);

  broadcastUpdate();
  const partnerRole: 'husband' | 'wife' = user.role === 'husband' ? 'wife' : 'husband';
  const senderName = user.role === 'husband' ? '남편' : '아내';
  sendPushToRole(partnerRole, '우리 가계부 🗑', `${senderName}이(가) 삭제를 요청했어요\n${tx.memo}`).catch(() => {});

  return Response.json({ deletionRequest: req });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return Response.json({ error: '잘못된 ID입니다' }, { status: 400 });

  const tx = await getTransactionById(numId);
  if (!tx) return Response.json({ error: '거래를 찾을 수 없습니다' }, { status: 404 });

  if (tx.created_by === user.role) {
    return Response.json({ error: '본인이 요청한 거래는 직접 승인할 수 없습니다' }, { status: 403 });
  }

  const { action } = await request.json();
  if (action === 'approve') {
    await approveTransaction(numId);
    broadcastUpdate();
    sendPushToRole(tx.created_by, '우리 가계부 ✅', `거래가 승인됐어요\n${tx.memo} — ${tx.amount.toLocaleString('ko-KR')}₫`).catch(() => {});
    return Response.json({ success: true });
  }
  if (action === 'reject') {
    await rejectTransaction(numId);
    broadcastUpdate();
    sendPushToRole(tx.created_by, '우리 가계부 ❌', `거래가 거절됐어요\n${tx.memo}`).catch(() => {});
    return Response.json({ success: true });
  }
  return Response.json({ error: '올바른 action이 아닙니다' }, { status: 400 });
}
