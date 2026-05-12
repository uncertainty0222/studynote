import { getTrades, getOpenTrades, initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await initDb();
  const { searchParams } = new URL(req.url);
  const open = searchParams.get('open') === 'true';
  const trades = open ? await getOpenTrades() : await getTrades(50);
  return Response.json({ trades });
}
