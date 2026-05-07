import { getNewsArticles, isDbConfigured } from "@/lib/db";

export async function GET() {
  if (!isDbConfigured()) {
    return Response.json({ error: "DB_NOT_CONFIGURED", articles: [] });
  }
  try {
    const articles = await getNewsArticles();
    return Response.json({ articles });
  } catch {
    return Response.json({ error: "DB_ERROR", articles: [] });
  }
}
