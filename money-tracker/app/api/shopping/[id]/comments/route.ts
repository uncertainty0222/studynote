import { getAuthUser } from '@/lib/auth';
import { getShoppingComments, createShoppingComment } from '@/lib/db';
import { broadcastUpdate } from '@/lib/broadcast';
import { sendPushToRole } from '@/lib/push';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return Response.json({ error: '잘못된 ID' }, { status: 400 });

  const comments = await getShoppingComments(numId);
  return Response.json({ comments });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return Response.json({ error: '잘못된 ID' }, { status: 400 });

  const { content } = await request.json();
  if (!content?.trim()) return Response.json({ error: '댓글을 입력해주세요' }, { status: 400 });

  const comment = await createShoppingComment(numId, user.role, content.trim());

  broadcastUpdate();
  const partnerRole: 'husband' | 'wife' = user.role === 'husband' ? 'wife' : 'husband';
  const authorName = user.role === 'husband' ? '남편' : '아내';
  sendPushToRole(partnerRole, '🛒 장보기 💬', `${authorName}: ${content.trim()}`).catch(() => {});

  return Response.json(comment, { status: 201 });
}
