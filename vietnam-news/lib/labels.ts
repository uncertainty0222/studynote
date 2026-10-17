// 화면에서 쓰는 이름 (클라이언트 번들에 SDK가 섞이지 않도록 rankings.ts와 분리)
import type { PeriodId, ScopeId } from "./rankings";

export const PERIOD_TABS: { id: PeriodId; label: string }[] = [
  { id: "day", label: "오늘" },
  { id: "week", label: "일주일" },
  { id: "month", label: "한 달" },
  { id: "quarter", label: "3개월" },
  { id: "year", label: "1년" },
];

export const LOCAL_TABS: { id: ScopeId; label: string }[] = [
  { id: "nhatrang", label: "나트랑" },
  { id: "dalat", label: "달랏" },
];
