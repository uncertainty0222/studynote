import { getAuthUser } from '@/lib/auth';
import { deletePersonalExpense } from '@/lib/db';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await deletePersonalExpense(parseInt(id));
  return Response.json({ success: true });
}
