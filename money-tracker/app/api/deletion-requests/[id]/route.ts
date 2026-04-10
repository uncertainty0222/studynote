import { getAuthUser } from '@/lib/auth';
import { getDeletionRequestById, approveDeletion, rejectDeletion } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return Response.json({ error: '잘못된 ID입니다' }, { status: 400 });

  const req = await getDeletionRequestById(numId);
  if (!req) return Response.json({ error: '요청을 찾을 수 없습니다' }, { status: 404 });

  if (req.requested_by === user.role) {
    return Response.json({ error: '본인이 요청한 삭제는 직접 승인할 수 없습니다' }, { status: 403 });
  }

  const { action } = await request.json();
  if (action === 'approve') { await approveDeletion(numId); return Response.json({ success: true }); }
  if (action === 'reject') { await rejectDeletion(numId); return Response.json({ success: true }); }
  return Response.json({ error: '올바른 action이 아닙니다' }, { status: 400 });
}
