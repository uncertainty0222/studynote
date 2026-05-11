import { getAuthUser } from '@/lib/auth';
import { createAssetSnapshot, getAssetSnapshots } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const snapshots = await getAssetSnapshots();
  return Response.json(snapshots);
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
