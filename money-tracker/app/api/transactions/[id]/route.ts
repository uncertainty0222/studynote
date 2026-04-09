import { getAuthUser } from '@/lib/auth';
import {
  getTransactionById,
  createDeletionRequest,
  approveTransaction,
  rejectTransaction,
} from '@/lib/db';

// DELETE — request deletion (creates a deletion request for partner to approve)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return Response.json({ error: '잘못된 ID입니다' }, { status: 400 });

  const tx = getTransactionById(numId);
  if (!tx) return Response.json({ error: '거래를 찾을 수 없습니다' }, { status: 404 });

  const req = createDeletionRequest(numId, user.role);
  return Response.json({ deletionRequest: req });
}

// PATCH — approve or reject a pending transaction
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return Response.json({ error: '잘못된 ID입니다' }, { status: 400 });

  const tx = getTransactionById(numId);
  if (!tx) return Response.json({ error: '거래를 찾을 수 없습니다' }, { status: 404 });

  // Only the partner can approve/reject (not the creator)
  if (tx.created_by === user.role) {
    return Response.json({ error: '본인이 요청한 거래는 직접 승인할 수 없습니다' }, { status: 403 });
  }

  const { action } = await request.json();
  if (action === 'approve') {
    approveTransaction(numId);
    return Response.json({ success: true, status: 'approved' });
  }
  if (action === 'reject') {
    rejectTransaction(numId);
    return Response.json({ success: true, status: 'rejected' });
  }
  return Response.json({ error: '올바른 action이 아닙니다' }, { status: 400 });
}
