import { getAuthUser } from '@/lib/auth';
import { getPendingDeletionRequests } from '@/lib/db';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const requests = await getPendingDeletionRequests();
  return Response.json({ requests });
}
