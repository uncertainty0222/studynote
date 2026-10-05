import { getNews } from "@/lib/news";

export const dynamic = "force-dynamic";

// GET /api/news          → 캐시된 결과 (15분)
// GET /api/news?refresh=1 → 강제 새로고침
export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  const bundle = await getNews(force);
  return Response.json(bundle);
}
