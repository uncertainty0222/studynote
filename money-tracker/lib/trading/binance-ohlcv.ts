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

// 특정 시각 기준 과거 캔들 조회 (트윗 게시 시점 분석용)
export async function getCandlesAt(
  symbol: string,
  interval: string,
  endTime: string, // ISO 8601 — 이 시각 이전의 캔들
  limit = 200
): Promise<Candle[]> {
  const endMs = new Date(endTime).getTime();
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&endTime=${endMs}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    // 선물 심볼이 없을 경우 스팟으로 재시도
    const spotUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&endTime=${endMs}&limit=${limit}`;
    const spotRes = await fetch(spotUrl);
    if (!spotRes.ok) throw new Error(`캔들 조회 실패: ${symbol} ${interval} @ ${endTime}`);
    const raw = await spotRes.json() as unknown[][];
    return raw.map((k) => ({
      openTime: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));
  }
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

export async function getCurrentPrice(symbol: string): Promise<number> {
  const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`가격 조회 실패: ${symbol}`);
  const data = await res.json() as { price: string };
  return parseFloat(data.price);
}
