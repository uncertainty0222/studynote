"use client";

import type { Ranking } from "@/lib/rankings";
import { weekTitle } from "@/lib/labels";
import { RankingView, Section, useRanking } from "../_components/WeeklyVietnam";

// 나트랑 부동산 주간 TOP 10. 순위 카드·잠금·로딩 화면은 뉴스 화면과 같은 것을 쓴다
export default function RealEstateView({ initial, currentWeek }: { initial: Ranking; currentWeek: string }) {
  const ranking = useRanking("realestate", "week", [initial]);
  const week = weekTitle(ranking?.weekKey ?? currentWeek);
  return (
    <>
      <Section
        id="realestate"
        title="나트랑 부동산"
        desc={`${week ? `${week.title} (${week.range}) · ` : ""}분양 · 시세 · 토지 · 임대 · 외국인 소유 규정`}
        badge="주간"
      >
        {/* 11위 이하 잠금을 누르면 뉴스 화면의 PRO 안내로 */}
        <RankingView ranking={ranking} onPaywall={() => (window.location.href = "/?paywall=1")} />
      </Section>
      <p className="mt-8 break-keep text-xs leading-relaxed text-zinc-500">
        AI가 기사 제목을 읽고 화제성과 중요성으로 고른 부동산 뉴스예요. 매물 정보가 아니며, 투자나 계약 판단은 원문 기사와 현지 전문가 확인을 거쳐 주세요.
        외국인은 베트남에서 주택을 사고 소유하는 데 제한이 있어요.
      </p>
    </>
  );
}
