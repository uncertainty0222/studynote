import { getScanResults, initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await initDb();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'pending';
  const setups = await getScanResults(status === 'all' ? undefined : status, 50);
  return Response.json({ setups });
}
