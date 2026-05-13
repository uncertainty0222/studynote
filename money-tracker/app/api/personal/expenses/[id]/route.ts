import { getAuthUser } from '@/lib/auth';
import { deletePersonalExpense, updatePersonalExpense } from '@/lib/db';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  await updatePersonalExpense(parseInt(id), body);
  return Response.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await deletePersonalExpense(parseInt(id));
  return Response.json({ success: true });
}
