import { getBalance } from '@/lib/db';

export async function GET() {
  const balance = getBalance();
  return Response.json(balance);
}
