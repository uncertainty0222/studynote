import { getAuthUser } from '@/lib/auth';
import { upsertPushSubscription, deletePushSubscription } from '@/lib/db';

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const subscription = await request.json();
  await upsertPushSubscription(user.role, subscription.endpoint, JSON.stringify(subscription));
  return Response.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpoint } = await request.json();
  await deletePushSubscription(endpoint);
  return Response.json({ success: true });
}
