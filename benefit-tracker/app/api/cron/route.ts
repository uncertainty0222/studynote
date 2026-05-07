import { isDbConfigured } from "@/lib/db";
import { refreshAllFeeds } from "@/lib/news";
import { sendPushToAll } from "@/lib/push";

// Vercel Cron 또는 외부 cron 서비스에서 매일 호출
// 보안: CRON_SECRET 환경 변수로 인증
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isDbConfigured()) {
    return Response.json({ error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const { total, newCount } = await refreshAllFeeds();

    if (newCount > 0) {
      await sendPushToAll(
        "새 정책 뉴스 도착!",
        `새로운 정책 소식 ${newCount}건이 업데이트됐어요!`
      ).catch(() => {});
    }

    return Response.json({ success: true, total, newCount, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("[cron]", e);
    return Response.json({ error: "CRON_FAILED" }, { status: 500 });
  }
}
