import { getAuthUser } from '@/lib/auth';
import { getOrCreateVoiceToken } from '@/lib/voiceToken';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ token: await getOrCreateVoiceToken(user.role) });
}

// Issue a new key; the old Shortcut stops working.
export async function POST() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ token: await getOrCreateVoiceToken(user.role, true) });
}
