import { getAccess } from "@/lib/access";
import { countNewItems } from "@/lib/market";
import { getRanking, weekRange } from "@/lib/rankings";
import { SITE_NAME } from "@/lib/labels";
import MarketHeader from "../market/MarketHeader";
import SiteTabs from "../_components/SiteTabs";
import RealEstateView from "./RealEstateView";

export const dynamic = "force-dynamic";
export const metadata = {
  title: `나트랑 부동산 · ${SITE_NAME}`,
  description: "나트랑·깜라인·칸호아 부동산 뉴스를 AI가 매주 골라 정리합니다",
};

// /realestate — 나트랑 부동산 주간 뉴스 TOP 10 (매물이 아니라 뉴스)
export default async function RealEstatePage() {
  const access = await getAccess();
  const marketNew = access.loginEnabled ? await countNewItems().catch(() => 0) : 0;
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <MarketHeader member={access.member} loginEnabled={access.loginEnabled} loginNext="realestate" />
      <SiteTabs active="realestate" marketNew={marketNew} />
      <main className="mx-auto max-w-2xl px-5 pb-24">
        <RealEstateView initial={getRanking("realestate", "week", access.premium)} currentWeek={weekRange().key} />
      </main>
    </div>
  );
}
