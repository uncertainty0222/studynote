import { saveTweet } from '../db';

interface VxTwitterMedia {
  url: string;
  type: string;
}

interface VxTwitterResponse {
  text: string;
  date: string;        // e.g. "Sat Jan 20 12:34:56 +0000 2024"
  date_epoch: number;  // Unix timestamp seconds
  user_name: string;
  mediaURLs: string[];
  media_extended: VxTwitterMedia[];
  combinedMediaUrl?: string;
}

function extractTweetId(url: string): string | null {
  const match = url.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

export async function fetchTweetByUrl(tweetUrl: string): Promise<{
  id: string;
  text: string;
  created_at: string;
  media_urls: string[];
  author: string;
}> {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) throw new Error(`유효하지 않은 트윗 URL: ${tweetUrl}`);

  // vxtwitter API — 무료, 인증 불필요
  const apiUrl = `https://api.vxtwitter.com/i/status/${tweetId}`;
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)' },
  });

  if (!res.ok) {
    throw new Error(`vxtwitter API 실패: ${res.status} — ${tweetUrl}`);
  }

  const data = await res.json() as VxTwitterResponse;

  const mediaUrls: string[] = [
    ...(data.mediaURLs ?? []),
    ...(data.media_extended ?? [])
      .filter((m) => m.type === 'image' || m.type === 'photo')
      .map((m) => m.url),
  ].filter((u, i, arr) => arr.indexOf(u) === i); // 중복 제거

  const createdAt = data.date_epoch
    ? new Date(data.date_epoch * 1000).toISOString()
    : new Date().toISOString();

  return {
    id: tweetId,
    text: data.text ?? '',
    created_at: createdAt,
    media_urls: mediaUrls,
    author: data.user_name ?? 'HaxKai',
  };
}

export async function fetchAndSaveTweets(urls: string[]): Promise<{
  saved: number;
  skipped: number;
  errors: string[];
}> {
  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const url of urls) {
    try {
      const tweet = await fetchTweetByUrl(url.trim());
      await saveTweet({
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at,
        media_urls: tweet.media_urls,
        processed: false,
      });
      saved++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('중복') || msg.includes('conflict') || msg.includes('ON CONFLICT')) {
        skipped++;
      } else {
        errors.push(`${url}: ${msg}`);
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return { saved, skipped, errors };
}
