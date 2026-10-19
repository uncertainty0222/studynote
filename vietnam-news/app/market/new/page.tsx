import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { AREAS, CATEGORIES, MAX_PHOTOS } from "@/lib/market";
import SiteTabs from "../../_components/SiteTabs";
import MarketHeader from "../MarketHeader";
import NewItemForm from "./NewItemForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "글쓰기 · 나트랑 장터" };

// /market/new — 판매 글 쓰기 (카카오 로그인 회원만)
export default async function NewItemPage() {
  const access = await getAccess();
  if (!access.loginEnabled) redirect("/market");
  if (!access.member) redirect("/api/auth/kakao?next=market");
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <MarketHeader nickname={access.member.nickname} loggedIn loginEnabled />
      <SiteTabs active="market" />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-6">
        <h1 className="text-[22px] font-bold tracking-tight">내 물건 팔기</h1>
        <NewItemForm categories={[...CATEGORIES]} areas={[...AREAS]} maxPhotos={MAX_PHOTOS} />
      </main>
    </div>
  );
}
