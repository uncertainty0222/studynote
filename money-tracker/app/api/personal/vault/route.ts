import { getAuthUser } from '@/lib/auth';
import { getVaultData, setVaultData } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const vault = await getVaultData();

  // Live exchange rates
  let usdToKrw = 1380;
  let usdToVnd = 25800;
  try {
    const fx = await fetch('https://open.er-api.com/v6/latest/USD');
    if (fx.ok) {
      const d = await fx.json() as { rates: Record<string, number> };
      usdToKrw = d.rates['KRW'] || 1380;
      usdToVnd = d.rates['VND'] || 25800;
    }
  } catch { /* use fallback */ }

  // Calculate totals
  const usdCash = Object.entries(vault.usd).reduce((s, [denom, cnt]) => s + Number(denom) * cnt, 0);
  const krwCash = Object.entries(vault.krw).reduce((s, [denom, cnt]) => s + Number(denom) * cnt, 0);
  const vndCash = Object.entries(vault.vnd).reduce((s, [denom, cnt]) => s + Number(denom) * cnt, 0);

  const totalUsd = usdCash + krwCash / usdToKrw + vndCash / usdToVnd;
  const totalKrw = usdCash * usdToKrw + krwCash + vndCash / usdToVnd * usdToKrw;
  const totalVnd = usdCash * usdToVnd + krwCash / usdToKrw * usdToVnd + vndCash;

  return Response.json({ vault, usdToKrw, usdToVnd, usdCash, krwCash, vndCash, totalUsd, totalKrw, totalVnd });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const data = await request.json();
  await setVaultData(data);
  return Response.json({ success: true });
}
