import { initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  await initDb();
  try {
    const { runMarketScan } = await import('@/lib/trading/setup-scanner');
    const result = await runMarketScan();
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
