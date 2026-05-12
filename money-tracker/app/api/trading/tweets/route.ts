import { getTweets, initDb } from '@/lib/db';
import { fetchAndSaveTweets } from '@/lib/trading/tweet-fetcher';
import { processUnprocessedTweets } from '@/lib/trading/tweet-processor';

export const dynamic = 'force-dynamic';

export async function GET() {
  await initDb();
  const tweets = await getTweets(30);
  return Response.json({ tweets });
}

export async function POST(req: Request) {
  await initDb();

  let body: { url?: string; urls?: string[] };
  try {
    body = await req.json() as { url?: string; urls?: string[] };
  } catch {
    return Response.json({ error: '요청 본문이 유효하지 않습니다' }, { status: 400 });
  }

  // 단일 URL 또는 여러 URL 지원
  const rawUrls: string[] = [];
  if (body.urls && Array.isArray(body.urls)) {
    rawUrls.push(...body.urls);
  } else if (body.url) {
    rawUrls.push(body.url);
  } else {
    return Response.json({ error: 'url 또는 urls 필드가 필요합니다' }, { status: 400 });
  }

  // 빈 줄 / 중복 제거
  const urls = [...new Set(rawUrls.map((u) => u.trim()).filter(Boolean))];
  if (urls.length === 0) {
    return Response.json({ error: '유효한 URL이 없습니다' }, { status: 400 });
  }

  try {
    // 1. vxtwitter로 트윗 정보 가져와서 DB 저장
    const fetchResult = await fetchAndSaveTweets(urls);

    // 2. Claude Vision + 타이밍 컨텍스트 분석 즉시 실행
    const processResult = await processUnprocessedTweets();

    return Response.json({
      saved: fetchResult.saved,
      skipped: fetchResult.skipped,
      errors: fetchResult.errors,
      patternsFound: processResult.patternsFound,
      timingContextsFetched: processResult.timingContexts,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
