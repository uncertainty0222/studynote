import { getBalance } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const balance = await getBalance();
  return Response.json(balance);
}
