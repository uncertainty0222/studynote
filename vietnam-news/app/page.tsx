import { getNews } from "@/lib/news";
import NewsBoard from "./_components/NewsBoard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const bundle = await getNews();
  return <NewsBoard initial={bundle} />;
}
