import { getUserCount } from '@/lib/db';

export async function GET() {
  const count = getUserCount();
  return Response.json({ configured: count > 0 });
}
