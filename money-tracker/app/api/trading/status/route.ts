import { getTweets, getLatestStyleProfile, getScanResults, getOpenTrades, getTodayRiskLimits, initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  await initDb();
  const [tweets, profile, pendingSetups, openTrades, riskToday] = await Promise.all([
    getTweets(1),
    getLatestStyleProfile(),
    getScanResults('pending', 5),
    getOpenTrades(),
    getTodayRiskLimits(),
  ]);

  return Response.json({
    tradingEnabled: process.env.TRADING_ENABLED === 'true',
    lastTweetFetch: tweets[0]?.fetched_at ?? null,
    styleProfileVersion: profile?.version ?? null,
    styleProfileTweetCount: profile?.tweet_count ?? 0,
    pendingSetupsCount: pendingSetups.length,
    openTradesCount: openTrades.length,
    todayPnlUsdt: riskToday.daily_pnl_usdt,
    todayLossUsdt: riskToday.daily_loss_usdt,
    todayTradeCount: riskToday.trade_count,
    maxDailyLossUsdt: Number(process.env.MAX_DAILY_LOSS_USDT ?? 200),
    checkedAt: new Date().toISOString(),
  });
}
