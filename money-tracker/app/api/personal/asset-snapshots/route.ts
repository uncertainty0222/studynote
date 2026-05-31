import { getAuthUser } from '@/lib/auth';
import { createAssetSnapshot, getAssetSnapshots, deleteAssetSnapshotsByRange, deleteAssetSnapshotsAbove } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const snapshots = await getAssetSnapshots();
  return Response.json(snapshots);
}

// DELETE /api/personal/asset-snapshots?from=2026-05-17&to=2026-05-19
// DELETE /api/personal/asset-snapshots?above=27000
export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const above = searchParams.get('above');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (above) {
    const deleted = await deleteAssetSnapshotsAbove(Number(above));
    return Response.json({ deleted });
  }
  if (from && to) {
    const deleted = await deleteAssetSnapshotsByRange(from, to);
    return Response.json({ deleted });
  }
  return Response.json({ error: 'from+to 또는 above 파라미터가 필요합니다' }, { status: 400 });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  await createAssetSnapshot({
    totalUsd: Number(body.totalUsd) || 0,
    vaultUsd: Number(body.vaultUsd) || 0,
    binanceUsd: Number(body.binanceUsd) || 0,
    usdToVnd: Number(body.usdToVnd) || 25800,
  });
  return Response.json({ ok: true });
}
