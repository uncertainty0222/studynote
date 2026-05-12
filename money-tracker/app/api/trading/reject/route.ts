import { getScanResultById, updateScanResultStatus, initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  await initDb();
  const { id } = await req.json() as { id: number };
  if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });

  const scanResult = await getScanResultById(id);
  if (!scanResult) return Response.json({ error: '셋업을 찾을 수 없습니다' }, { status: 404 });

  await updateScanResultStatus(id, 'rejected');
  return Response.json({ success: true });
}
