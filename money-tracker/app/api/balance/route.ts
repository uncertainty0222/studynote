import { getBalance } from '@/lib/db';

export async function GET() {
  const balance = await getBalance();
  return Response.json(balance);
}
