import { getScanResultById, initDb } from '@/lib/db';
import { executeTrade } from '@/lib/trading/order-executor';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  await initDb();
  const { id } = await req.json() as { id: number };
  if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });

  const scanResult = await getScanResultById(id);
  if (!scanResult) return Response.json({ error: '셋업을 찾을 수 없습니다' }, { status: 404 });
  if (scanResult.status !== 'pending' && scanResult.status !== 'alerted') {
    return Response.json({ error: `이미 처리된 셋업입니다: ${scanResult.status}` }, { status: 400 });
  }

  const result = await executeTrade(scanResult);
  if (!result.success) {
    return Response.json({ error: result.message }, { status: 400 });
  }

  return Response.json({ success: true, message: result.message, tradeId: result.tradeId });
}
