import { getVapidPublicKey } from '@/lib/push';

export async function GET() {
  const publicKey = await getVapidPublicKey();
  return Response.json({ publicKey });
}
