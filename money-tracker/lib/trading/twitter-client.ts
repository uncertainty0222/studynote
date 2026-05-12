import { TwitterApi } from 'twitter-api-v2';
import { saveTweet, getLatestTweetId } from '../db';

let client: TwitterApi | null = null;

function getClient(): TwitterApi {
  if (client) return client;
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) throw new Error('TWITTER_BEARER_TOKEN 환경변수가 필요합니다');
  client = new TwitterApi(token);
  return client;
}

export async function fetchHaxkaiTweets(): Promise<number> {
  const userId = process.env.HAXKAI_USER_ID;
  if (!userId) throw new Error('HAXKAI_USER_ID 환경변수가 필요합니다');

  const api = getClient().readOnly;
  const sinceId = await getLatestTweetId();

  const params: Parameters<typeof api.v2.userTimeline>[1] = {
    max_results: 10,
    expansions: ['attachments.media_keys'],
    'media.fields': ['url', 'preview_image_url', 'type'],
    'tweet.fields': ['created_at', 'attachments'],
  };

  if (sinceId) params.since_id = sinceId;

  const timeline = await api.v2.userTimeline(userId, params);
  const tweets = timeline.data.data ?? [];
  const mediaMap = new Map<string, string>();

  for (const media of (timeline.data.includes?.media ?? [])) {
    if (media.media_key && (media.url || media.preview_image_url)) {
      mediaMap.set(media.media_key, (media.url ?? media.preview_image_url)!);
    }
  }

  let saved = 0;
  for (const tweet of tweets) {
    const mediaKeys = tweet.attachments?.media_keys ?? [];
    const mediaUrls = mediaKeys.map((k: string) => mediaMap.get(k)).filter(Boolean) as string[];

    await saveTweet({
      id: tweet.id,
      text: tweet.text,
      created_at: tweet.created_at ?? new Date().toISOString(),
      media_urls: mediaUrls,
      processed: false,
    });
    saved++;
  }

  return saved;
}
