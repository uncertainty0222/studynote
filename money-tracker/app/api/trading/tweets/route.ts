import { getTweets, initDb } from '@/lib/db';
import { fetchHaxkaiTweets } from '@/lib/trading/twitter-client';
import { processUnprocessedTweets } from '@/lib/trading/tweet-processor';

export const dynamic = 'force-dynamic';

export async function GET() {
  await initDb();
  const tweets = await getTweets(30);
  return Response.json({ tweets });
}

export async function POST() {
  await initDb();
  try {
    const fetched = await fetchHaxkaiTweets();
    const { processed, patternsFound } = await processUnprocessedTweets();
    return Response.json({ fetched, processed, patternsFound });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
