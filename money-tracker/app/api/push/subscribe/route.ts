import { getAuthUser } from '@/lib/auth';
import { upsertPushSubscription } from '@/lib/db';

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const subscription = await request.json();
  await upsertPushSubscription(user.role, subscription.endpoint, JSON.stringify(subscription));
  return Response.json({ success: true });
}
