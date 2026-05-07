import { isDbConfigured } from "@/lib/db";
import { refreshAllFeeds } from "@/lib/news";
import { sendPushToAll } from "@/lib/push";

export async function POST() {
  if (!isDbConfigured()) {
    return Response.json({ error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    const { total, newCount } = await refreshAllFeeds();

    if (newCount > 0) {
      await sendPushToAll(
        "새 정책 뉴스 도착!",
        `새로운 정책 소식 ${newCount}건이 업데이트됐어요. 확인해보세요!`
      ).catch(() => {});
    }

    return Response.json({ success: true, total, newCount });
  } catch (e) {
    console.error("[news/refresh]", e);
    return Response.json({ error: "REFRESH_FAILED" }, { status: 500 });
  }
}
