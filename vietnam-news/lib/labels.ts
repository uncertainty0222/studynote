// 화면에서 쓰는 이름 (클라이언트 번들에 SDK가 섞이지 않도록 rankings.ts와 분리)
import type { PeriodId, ScopeId } from "./rankings";

export const SITE_NAME = "주간베트남";

// 주간이 무료, 나머지는 이용권
export const PERIOD_TABS: { id: PeriodId; label: string; premium: boolean }[] = [
  { id: "week", label: "주간", premium: false },
  { id: "day", label: "일간", premium: true },
  { id: "month", label: "월간", premium: true },
  { id: "year", label: "1년", premium: true },
  { id: "threeYear", label: "3년", premium: true },
];

export const SECTIONS: { id: string; title: string; desc: string; scopes: { id: ScopeId; label: string }[] }[] = [
  {
    id: "vietnam",
    title: "베트남",
    desc: "국제정세 · 국내정책 · 경제 · 한국 관련",
    scopes: [{ id: "national", label: "베트남" }],
  },
  {
    id: "local",
    title: "나트랑 · 달랏",
    desc: "관광 · 교통 · 날씨 · 지역 소식",
    scopes: [
      { id: "nhatrang", label: "나트랑" },
      { id: "dalat", label: "달랏" },
    ],
  },
  {
    id: "expat",
    title: "교민정보",
    desc: "비자·체류 · 환율·송금 · 부동산 · 사업·세금 · 관광업 규정 · 사건사고",
    scopes: [{ id: "expat", label: "교민정보" }],
  },
];

// 제1호 = 2026.10.5(월)~10.11(일) 주
const FIRST_ISSUE_MONDAY = Date.parse("2026-10-05T00:00:00Z");

export function issueNumber(weekKey?: string) {
  if (!weekKey) return null;
  const n = Math.round((Date.parse(`${weekKey}T00:00:00Z`) - FIRST_ISSUE_MONDAY) / (7 * 86400_000)) + 1;
  return n >= 1 ? n : null;
}
