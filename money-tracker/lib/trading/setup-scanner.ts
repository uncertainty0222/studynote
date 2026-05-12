import { getTopFuturesSymbols, getCandles } from './binance-ohlcv';
import { calculateIndicators, detectPattern } from './ta-calculator';
import { scoreSetup } from './setup-scorer';
import { getLatestStyleProfile, saveScanResult, updateScanResultStatus } from '../db';
import type { StyleProfile } from './style-builder';
import { sendScanAlert as telegramScanAlert } from './telegram-notifier';

const TIMEFRAMES = ['4h', '1d'] as const;
const ALERT_THRESHOLD = 0.75;
const SAVE_THRESHOLD = 0.50;

export async function runMarketScan(): Promise<{ scanned: number; saved: number; alerted: number }> {
  const profileRow = await getLatestStyleProfile();
  if (!profileRow) {
    console.log('[Scanner] 스타일 프로파일 없음 — 먼저 트윗을 분석하세요');
    return { scanned: 0, saved: 0, alerted: 0 };
  }

  const style = profileRow.profile_data as unknown as StyleProfile;
  const symbols = await getTopFuturesSymbols(50);

  let scanned = 0;
  let saved = 0;
  let alerted = 0;

  for (const symbol of symbols) {
    for (const tf of TIMEFRAMES) {
      try {
        const candles = await getCandles(symbol, tf, 200);
        if (candles.length < 50) continue;

        const snapshot = calculateIndicators(candles);
        const detectedPattern = detectPattern(snapshot, candles);
        const usedIndicators = [
          snapshot.rsi14 !== null ? 'RSI' : '',
          snapshot.macdLine !== null ? 'MACD' : '',
          snapshot.ema20 !== null ? 'EMA20' : '',
          snapshot.ema50 !== null ? 'EMA50' : '',
          snapshot.ema200 !== null ? 'EMA200' : '',
          snapshot.bbUpper !== null ? 'BB' : '',
        ].filter(Boolean);

        const { score, reasoning } = scoreSetup({
          detectedPattern,
          snapshot,
          indicators: usedIndicators,
          timeframe: tf.toUpperCase(),
          style,
        });

        scanned++;

        if (score < SAVE_THRESHOLD) continue;

        const price = snapshot.currentPrice;
        const atr = snapshot.atr14 ?? price * 0.02;
        const isLong = detectedPattern !== 'breakdown' && detectedPattern !== 'resistance_reject' && detectedPattern !== 'bear_flag';

        const entry = price;
        const target = isLong ? price + atr * 2.5 : price - atr * 2.5;
        const stop = isLong ? price - atr * 1.0 : price + atr * 1.0;
        const rr = Math.abs(target - entry) / Math.abs(entry - stop);

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const scanResult = await saveScanResult({
          symbol,
          timeframe: tf.toUpperCase(),
          detected_pattern: detectedPattern,
          indicators_snapshot: snapshot as unknown as Record<string, unknown>,
          style_match_score: score,
          entry_price: entry,
          target_price: target,
          stop_price: stop,
          risk_reward: rr,
          scan_reasoning: reasoning,
          status: 'pending',
          expires_at: expiresAt,
        });
        saved++;

        if (score >= ALERT_THRESHOLD) {
          await telegramScanAlert({
            symbol,
            timeframe: tf.toUpperCase(),
            pattern: detectedPattern,
            score,
            entry,
            target,
            stop,
            rr,
            reasoning,
            scanId: scanResult.id,
          });
          await updateScanResultStatus(scanResult.id, 'alerted');
          alerted++;
        }

        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.error(`[Scanner] ${symbol} ${tf} 실패:`, err);
      }
    }
  }

  console.log(`[Scanner] 완료: ${scanned}개 스캔, ${saved}개 저장, ${alerted}개 알림`);
  return { scanned, saved, alerted };
}
