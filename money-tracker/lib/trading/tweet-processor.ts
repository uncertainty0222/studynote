import { getUnprocessedTweets, markTweetProcessed, saveTaPattern, getUnprocessedTaPatternCount } from '../db';
import { analyzeChartTweet, analyzeTextOnlyTweet } from './chart-analyzer';
import { buildStyleProfile } from './style-builder';

const STYLE_UPDATE_INTERVAL = 5;

export async function processUnprocessedTweets(): Promise<{ processed: number; patternsFound: number }> {
  const tweets = await getUnprocessedTweets();
  let processed = 0;
  let patternsFound = 0;

  for (const tweet of tweets) {
    try {
      let analysis;
      if (tweet.media_urls.length > 0) {
        analysis = await analyzeChartTweet(tweet.text, tweet.media_urls);
      } else {
        analysis = await analyzeTextOnlyTweet(tweet.text);
      }

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
          entry_logic: entryLevel ? { price_level: entryLevel.price, condition: analysis.entry_condition } : null,
          target_logic: targetLevel ? { price_level: targetLevel.price, condition: analysis.target_condition } : null,
          stop_logic: stopLevel ? { price_level: stopLevel.price, condition: analysis.stop_condition } : null,
          risk_reward_ratio: analysis.risk_reward_estimate,
          confidence_score: analysis.confidence,
          raw_analysis: analysis as unknown as Record<string, unknown>,
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

  const pendingCount = await getUnprocessedTaPatternCount();
  if (pendingCount >= STYLE_UPDATE_INTERVAL || (patternsFound > 0 && pendingCount > 0)) {
    try {
      await buildStyleProfile();
      console.log('[TweetProcessor] 스타일 프로파일 업데이트 완료');
    } catch (err) {
      console.error('[TweetProcessor] 스타일 빌드 실패:', err);
    }
  }

  return { processed, patternsFound };
}
