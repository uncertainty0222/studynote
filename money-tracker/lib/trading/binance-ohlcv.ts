export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FuturesSymbolInfo {
  symbol: string;
  quoteVolume: number;
}

export async function getCandles(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance klines 실패: ${symbol} ${interval}`);

  const raw = await res.json() as unknown[][];
  return raw.map((k) => ({
    openTime: k[0] as number,
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

export async function getTopFuturesSymbols(limit = 50): Promise<string[]> {
  const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
  if (!res.ok) throw new Error('Binance 24hr ticker 실패');

  const tickers = await res.json() as FuturesSymbolInfo[];
  return tickers
    .filter((t) => t.symbol.endsWith('USDT') && !t.symbol.includes('_'))
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, limit)
    .map((t) => t.symbol);
}

export async function getCurrentPrice(symbol: string): Promise<number> {
  const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`가격 조회 실패: ${symbol}`);
  const data = await res.json() as { price: string };
  return parseFloat(data.price);
}
