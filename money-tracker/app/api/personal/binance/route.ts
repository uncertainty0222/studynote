import crypto from 'crypto';

export const dynamic = 'force-dynamic';

interface BinanceBalance { asset: string; free: string; locked: string; }
interface TickerPrice { symbol: string; price: string; }

export async function GET() {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;

  if (!apiKey || !apiSecret) {
    return Response.json({ error: 'BINANCE_API_KEY와 BINANCE_API_SECRET을 Railway 환경변수에 설정해주세요' }, { status: 503 });
  }

  try {
    // Fetch account balances
    const timestamp = Date.now();
    const qs = `timestamp=${timestamp}`;
    const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
    const accountRes = await fetch(`https://api.binance.com/api/v3/account?${qs}&signature=${sig}`, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });
    if (!accountRes.ok) {
      const err = await accountRes.json();
      return Response.json({ error: `Binance 오류: ${err.msg ?? accountRes.status}` }, { status: 400 });
    }
    const account = await accountRes.json() as { balances: BinanceBalance[] };
    const nonZero = account.balances.filter(b => parseFloat(b.free) + parseFloat(b.locked) > 0.00000001);

    // Fetch all USDT prices
    const priceRes = await fetch('https://api.binance.com/api/v3/ticker/price');
    const prices = await priceRes.json() as TickerPrice[];
    const priceMap: Record<string, number> = {};
    for (const p of prices) priceMap[p.symbol] = parseFloat(p.price);

    const STABLE = new Set(['USDT', 'BUSD', 'USDC', 'DAI', 'TUSD', 'FDUSD']);
    const holdings = nonZero.map(b => {
      const total = parseFloat(b.free) + parseFloat(b.locked);
      let usdtValue = 0;
      if (STABLE.has(b.asset)) usdtValue = total;
      else if (priceMap[`${b.asset}USDT`]) usdtValue = total * priceMap[`${b.asset}USDT`];
      else if (priceMap[`${b.asset}BTC`] && priceMap['BTCUSDT']) usdtValue = total * priceMap[`${b.asset}BTC`] * priceMap['BTCUSDT'];
      return { asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked), total, usdtValue };
    }).sort((a, b) => b.usdtValue - a.usdtValue);

    const totalUsdt = holdings.reduce((s, h) => s + h.usdtValue, 0);
    return Response.json({ holdings, totalUsdt, updatedAt: new Date().toISOString() });
  } catch (e) {
    return Response.json({ error: `연결 실패: ${String(e)}` }, { status: 500 });
  }
}
