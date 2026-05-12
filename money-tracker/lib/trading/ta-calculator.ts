import {
  RSI,
  MACD,
  EMA,
  BollingerBands,
  ATR,
} from 'technicalindicators';
import type { Candle } from './binance-ohlcv';

export interface TaSnapshot {
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  atr14: number | null;
  volumeRatio: number | null;
  currentPrice: number;
  priceVsEma200: number | null;
}

export function calculateIndicators(candles: Candle[]): TaSnapshot {
  if (candles.length < 30) {
    return {
      rsi14: null, macdLine: null, macdSignal: null, macdHistogram: null,
      ema20: null, ema50: null, ema200: null,
      bbUpper: null, bbMiddle: null, bbLower: null,
      atr14: null, volumeRatio: null,
      currentPrice: candles[candles.length - 1]?.close ?? 0,
      priceVsEma200: null,
    };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);
  const currentPrice = closes[closes.length - 1];

  const rsiValues = RSI.calculate({ values: closes, period: 14 });
  const rsi14 = rsiValues[rsiValues.length - 1] ?? null;

  const macdValues = MACD.calculate({
    values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
  });
  const lastMacd = macdValues[macdValues.length - 1];
  const macdLine = lastMacd?.MACD ?? null;
  const macdSignal = lastMacd?.signal ?? null;
  const macdHistogram = lastMacd?.histogram ?? null;

  const ema20Values = EMA.calculate({ values: closes, period: 20 });
  const ema20 = ema20Values[ema20Values.length - 1] ?? null;

  const ema50Values = EMA.calculate({ values: closes, period: 50 });
  const ema50 = ema50Values[ema50Values.length - 1] ?? null;

  let ema200: number | null = null;
  let priceVsEma200: number | null = null;
  if (closes.length >= 200) {
    const ema200Values = EMA.calculate({ values: closes, period: 200 });
    ema200 = ema200Values[ema200Values.length - 1] ?? null;
    if (ema200) priceVsEma200 = ((currentPrice - ema200) / ema200) * 100;
  }

  const bbValues = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
  const lastBb = bbValues[bbValues.length - 1];
  const bbUpper = lastBb?.upper ?? null;
  const bbMiddle = lastBb?.middle ?? null;
  const bbLower = lastBb?.lower ?? null;

  const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const atr14 = atrValues[atrValues.length - 1] ?? null;

  const recentVolumes = volumes.slice(-20);
  const avgVolume = recentVolumes.reduce((s, v) => s + v, 0) / recentVolumes.length;
  const volumeRatio = avgVolume > 0 ? volumes[volumes.length - 1] / avgVolume : null;

  return {
    rsi14, macdLine, macdSignal, macdHistogram,
    ema20, ema50, ema200, bbUpper, bbMiddle, bbLower,
    atr14, volumeRatio, currentPrice, priceVsEma200,
  };
}

export function detectPattern(snap: TaSnapshot, candles: Candle[]): string {
  const { rsi14, macdHistogram, ema20, ema50, ema200, currentPrice, bbLower, bbUpper, bbMiddle } = snap;

  if (!rsi14 || !currentPrice) return 'none';

  if (rsi14 < 35 && ema200 && currentPrice > ema200 * 0.98 && currentPrice < ema200 * 1.02) {
    return 'support_bounce';
  }
  if (rsi14 > 65 && ema200 && currentPrice > ema200 * 1.02 && macdHistogram && macdHistogram < 0) {
    return 'resistance_reject';
  }
  if (ema20 && ema50 && ema200 && ema20 > ema50 && ema50 > ema200 && rsi14 > 50 && rsi14 < 70) {
    return 'breakout';
  }
  if (ema20 && ema50 && ema200 && ema20 < ema50 && ema50 < ema200 && rsi14 < 50 && rsi14 > 30) {
    return 'breakdown';
  }
  if (bbLower && bbMiddle && currentPrice < bbLower * 1.01 && rsi14 < 35) {
    return 'bull_flag';
  }
  if (bbUpper && bbMiddle && currentPrice > bbUpper * 0.99 && rsi14 > 65) {
    return 'bear_flag';
  }
  if (snap.volumeRatio && snap.volumeRatio > 1.5 && rsi14 > 55) {
    return 'breakout';
  }

  return 'consolidation';
}
