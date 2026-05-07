import { getAuthUser } from '@/lib/auth';
import { deletePersonalIncome } from '@/lib/db';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await deletePersonalIncome(parseInt(id));
  return Response.json({ success: true });
}
