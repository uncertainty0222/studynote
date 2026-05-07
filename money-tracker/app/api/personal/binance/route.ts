import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function hmac(secret: string, data: string) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

interface SpotBalance { asset: string; free: string; locked: string; }
interface TickerPrice { symbol: string; price: string; }
interface FuturesAccount { totalMarginBalance: string; }
interface FundingAsset { asset: string; free: string; locked: string; freeze: string; withdrawing: string; }

const STABLE = new Set(['USDT', 'BUSD', 'USDC', 'DAI', 'TUSD', 'FDUSD']);

export async function GET() {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    return Response.json({ error: 'BINANCE_API_KEY와 BINANCE_API_SECRET을 Railway 환경변수에 설정해주세요' }, { status: 503 });
  }

  try {
    const ts = Date.now();
    const qs = `timestamp=${ts}`;
    const sig = hmac(apiSecret, qs);
    const h = { 'X-MBX-APIKEY': apiKey };

    const [pricesR, spotR, futuresR, fundingR, fxR] = await Promise.allSettled([
      fetch('https://api.binance.com/api/v3/ticker/price'),
      fetch(`https://api.binance.com/api/v3/account?${qs}&signature=${sig}`, { headers: h }),
      fetch(`https://fapi.binance.com/fapi/v2/account?${qs}&signature=${sig}`, { headers: h }),
      fetch(`https://api.binance.com/sapi/v1/asset/get-funding-asset?${qs}&signature=${sig}`, { method: 'POST', headers: h }),
      fetch('https://open.er-api.com/v6/latest/USD'),
    ]);

    // Price map
    const priceMap: Record<string, number> = {};
    if (pricesR.status === 'fulfilled' && pricesR.value.ok) {
      const prices = await pricesR.value.json() as TickerPrice[];
      for (const p of prices) priceMap[p.symbol] = parseFloat(p.price);
    }

    function toUsdt(asset: string, amount: number): number {
      if (STABLE.has(asset)) return amount;
      if (priceMap[`${asset}USDT`]) return amount * priceMap[`${asset}USDT`];
      if (priceMap[`${asset}BTC`] && priceMap['BTCUSDT']) return amount * priceMap[`${asset}BTC`] * priceMap['BTCUSDT'];
      return 0;
    }

    // SPOT
    let spotUsdt = 0;
    let spotHoldings: { asset: string; total: number; usdtValue: number }[] = [];
    if (spotR.status === 'fulfilled' && spotR.value.ok) {
      const data = await spotR.value.json() as { balances: SpotBalance[] };
      spotHoldings = data.balances
        .filter(b => parseFloat(b.free) + parseFloat(b.locked) > 0.00000001)
        .map(b => {
          const total = parseFloat(b.free) + parseFloat(b.locked);
          return { asset: b.asset, total, usdtValue: toUsdt(b.asset, total) };
        })
        .filter(h => h.usdtValue > 0.01)
        .sort((a, b) => b.usdtValue - a.usdtValue);
      spotUsdt = spotHoldings.reduce((s, h) => s + h.usdtValue, 0);
    }

    // FUTURES (USDT-M)
    let futuresUsdt = 0;
    if (futuresR.status === 'fulfilled' && futuresR.value.ok) {
      const data = await futuresR.value.json() as FuturesAccount;
      futuresUsdt = parseFloat(data.totalMarginBalance) || 0;
    }

    // FUNDING
    let fundingUsdt = 0;
    let fundingHoldings: { asset: string; total: number; usdtValue: number }[] = [];
    if (fundingR.status === 'fulfilled' && fundingR.value.ok) {
      const data = await fundingR.value.json() as FundingAsset[];
      if (Array.isArray(data)) {
        fundingHoldings = data
          .map(b => {
            const total = parseFloat(b.free || '0') + parseFloat(b.locked || '0') + parseFloat(b.freeze || '0') + parseFloat(b.withdrawing || '0');
            return { asset: b.asset, total, usdtValue: toUsdt(b.asset, total) };
          })
          .filter(h => h.usdtValue > 0.01)
          .sort((a, b) => b.usdtValue - a.usdtValue);
        fundingUsdt = fundingHoldings.reduce((s, h) => s + h.usdtValue, 0);
      }
    }

    // Exchange rates (1 USD ≈ 1 USDT)
    let usdToVnd = 25800;
    let usdToKrw = 1380;
    if (fxR.status === 'fulfilled' && fxR.value.ok) {
      const fxData = await fxR.value.json() as { rates: Record<string, number> };
      usdToVnd = fxData.rates['VND'] || 25800;
      usdToKrw = fxData.rates['KRW'] || 1380;
    }

    const totalUsdt = spotUsdt + futuresUsdt + fundingUsdt;

    return Response.json({
      sections: [
        { key: 'spot', label: 'SPOT', usdt: spotUsdt, holdings: spotHoldings },
        { key: 'futures', label: 'FUTURES', usdt: futuresUsdt, holdings: [] },
        { key: 'funding', label: 'FUNDING', usdt: fundingUsdt, holdings: fundingHoldings },
      ],
      totalUsdt,
      usdToVnd,
      usdToKrw,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: `연결 실패: ${String(e)}` }, { status: 500 });
  }
}
