export const MANGO_BIRTHDAY = new Date("2025-07-28T00:00:00+09:00");

export function getAgeInMonths(birthday: Date = MANGO_BIRTHDAY, now = new Date()): number {
  const months =
    (now.getFullYear() - birthday.getFullYear()) * 12 +
    (now.getMonth() - birthday.getMonth());
  return now.getDate() < birthday.getDate() ? months - 1 : months;
}

export function getAgeInDays(birthday: Date = MANGO_BIRTHDAY, now = new Date()): number {
  return Math.floor((now.getTime() - birthday.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatAge(birthday: Date = MANGO_BIRTHDAY, now = new Date()): string {
  const months = getAgeInMonths(birthday, now);
  if (months < 1) return `${getAgeInDays(birthday, now)}일`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${months}개월`;
  if (rem === 0) return `${years}세`;
  return `${years}세 ${rem}개월`;
}

export type ComputedStatus = "active" | "missed" | "upcoming" | "conditional";

export interface EligibilityRule {
  applyWindowDays?: number;  // 출생 후 신청 가능 기간 (일)
  ageFromMonths?: number;    // 최소 연령 (개월)
  ageToMonths?: number;      // 최대 연령 (개월, 미만)
  isOneTime: boolean;
  rawStatus: string;         // 원본 status 값
}

export function computeBenefitStatus(
  rule: EligibilityRule,
  ageMonths: number,
  ageDays: number
): ComputedStatus {
  if (rule.rawStatus === "조건부") return "conditional";
  if (rule.rawStatus === "예정") return "upcoming";

  if (rule.ageFromMonths !== undefined && ageMonths < rule.ageFromMonths) return "upcoming";
  if (rule.ageToMonths !== undefined && ageMonths >= rule.ageToMonths) return "missed";

  if (rule.isOneTime && rule.applyWindowDays !== undefined) {
    if (ageDays > rule.applyWindowDays) return "missed";
  }

  return "active";
}

/** 신청 마감까지 남은 일수 (0 이하면 만료) */
export function daysUntilDeadline(
  rule: EligibilityRule,
  birthday: Date = MANGO_BIRTHDAY,
  now = new Date()
): number | null {
  if (rule.isOneTime && rule.applyWindowDays !== undefined) {
    const deadline = new Date(birthday.getTime() + rule.applyWindowDays * 86400000);
    return Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
  }
  if (rule.ageToMonths !== undefined) {
    const ageMonths = getAgeInMonths(birthday, now);
    return (rule.ageToMonths - ageMonths) * 30;
  }
  return null;
}
