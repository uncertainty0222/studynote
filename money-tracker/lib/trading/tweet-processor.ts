import { getUnprocessedTweets, markTweetProcessed, saveTaPattern, getUnprocessedTaPatternCount } from '../db';
import { analyzeChartTweet, analyzeTextOnlyTweet, type TimingContext } from './chart-analyzer';
import { buildStyleProfile } from './style-builder';
import { getCandlesAt } from './binance-ohlcv';
import { calculateIndicators } from './ta-calculator';

const STYLE_UPDATE_INTERVAL = 5;

// 트윗 텍스트에서 심볼 추측 (BTC, ETH, SOL 등)
function guessSymbol(text: string): string | null {
  const patterns = [
    /\b([A-Z]{2,6})USDT\b/,
    /\$([A-Z]{2,6})\b/,
    /\b(BTC|ETH|SOL|BNB|XRP|ADA|AVAX|DOT|LINK|MATIC|DOGE|SHIB|ARB|OP|APT|SUI|INJ|TIA|JUP|WIF)\b/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1].toUpperCase() + (m[0].endsWith('USDT') ? '' : 'USDT');
  }
  return null;
}

async function buildTimingContext(
  symbol: string | null,
  tweetCreatedAt: string
): Promise<TimingContext | undefined> {
  if (!symbol) return undefined;
  const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
  try {
    // 4H 캔들 기준으로 타이밍 분석 (HaxKai가 주로 사용하는 타임프레임)
    const candles = await getCandlesAt(sym, '4h', tweetCreatedAt, 200);
    if (candles.length < 30) return undefined;
    const snap = calculateIndicators(candles);
    return {
      symbol: sym,
      timeframe: '4H',
      tweetTime: tweetCreatedAt,
      price: snap.currentPrice,
      rsi14: snap.rsi14,
      macdHistogram: snap.macdHistogram,
      ema20: snap.ema20,
      ema50: snap.ema50,
      ema200: snap.ema200,
      priceVsEma200: snap.priceVsEma200,
      volumeRatio: snap.volumeRatio,
      atr14: snap.atr14,
    };
  } catch (err) {
    console.warn(`[TimingContext] ${sym} 조회 실패:`, err);
    return undefined;
  }
}

export async function processUnprocessedTweets(): Promise<{
  processed: number;
  patternsFound: number;
  timingContexts: number;
}> {
  const tweets = await getUnprocessedTweets();
  let processed = 0;
  let patternsFound = 0;
  let timingContexts = 0;

  for (const tweet of tweets) {
    try {
      // 1. 텍스트에서 심볼 우선 추측
      const guessedSymbol = guessSymbol(tweet.text);

      // 2. 타이밍 컨텍스트 빌드 (Binance OHLCV)
      const timingCtx = await buildTimingContext(guessedSymbol, tweet.created_at);
      if (timingCtx) timingContexts++;

      // 3. Claude Vision 분석 (이미지 + 타이밍 컨텍스트)
      let analysis;
      if (tweet.media_urls.length > 0) {
        analysis = await analyzeChartTweet(tweet.text, tweet.media_urls, timingCtx);
      } else {
        analysis = await analyzeTextOnlyTweet(tweet.text, timingCtx);
      }

      // 4. 신뢰도 0.4 이상만 저장
      if (analysis.confidence >= 0.4 && analysis.pattern_type !== 'none') {
        const entryLevel = analysis.key_levels.find((l) => l.type === 'entry');
        const targetLevel = analysis.key_levels.find((l) => l.type === 'target');
        const stopLevel = analysis.key_levels.find((l) => l.type === 'stop');

        await saveTaPattern({
          tweet_id: tweet.id,
          symbol: analysis.symbol,
          timeframe: analysis.timeframe,
          pattern_type: analysis.pattern_type,
          indicators_used: analysis.indicators_visible,
          entry_logic: entryLevel
            ? { price_level: entryLevel.price, condition: analysis.entry_condition }
            : null,
          target_logic: targetLevel
            ? { price_level: targetLevel.price, condition: analysis.target_condition }
            : null,
          stop_logic: stopLevel
            ? { price_level: stopLevel.price, condition: analysis.stop_condition }
            : null,
          risk_reward_ratio: analysis.risk_reward_estimate,
          confidence_score: analysis.confidence,
          raw_analysis: analysis as unknown as Record<string, unknown>,
          timing_context: timingCtx as unknown as Record<string, unknown> ?? null,
          timing_reasoning: analysis.timing_reasoning,
        });
        patternsFound++;
      }

      await markTweetProcessed(tweet.id);
      processed++;
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`[TweetProcessor] 트윗 ${tweet.id} 처리 실패:`, err);
    }
  }

  // 5. 5개마다 스타일 프로파일 자동 업데이트
  const pendingCount = await getUnprocessedTaPatternCount();
  if (pendingCount >= STYLE_UPDATE_INTERVAL || (patternsFound > 0 && pendingCount > 0)) {
    try {
      await buildStyleProfile();
      console.log('[TweetProcessor] 스타일 프로파일 업데이트 완료');
    } catch (err) {
      console.error('[TweetProcessor] 스타일 빌드 실패:', err);
    }
  }

  return { processed, patternsFound, timingContexts };
}
