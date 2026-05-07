"use client";

import { useMemo } from "react";
import { benefits, categoryColors } from "@/data/benefits";
import {
  MANGO_BIRTHDAY,
  getAgeInMonths,
  getAgeInDays,
  formatAge,
  computeBenefitStatus,
  daysUntilDeadline,
  type ComputedStatus,
} from "@/lib/ageUtils";
import type { Benefit } from "@/data/benefits";

function statusLabel(s: ComputedStatus) {
  return { active: "받을 수 있어요", missed: "놓친 혜택", upcoming: "예정", conditional: "조건 확인" }[s];
}

interface BenefitRowProps {
  benefit: Benefit;
  computedStatus: ComputedStatus;
  ageMonths: number;
  ageDays: number;
}

function BenefitRow({ benefit, computedStatus, ageDays }: BenefitRowProps) {
  const cat = categoryColors[benefit.category];
  const daysLeft = daysUntilDeadline(benefit, MANGO_BIRTHDAY);
  const isUrgent = daysLeft !== null && daysLeft > 0 && daysLeft <= 60;

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
      computedStatus === "missed" ? "border-red-200 bg-red-50 opacity-80" :
      isUrgent ? "border-amber-300 bg-amber-50" :
      "border-gray-100 bg-white"
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900">{benefit.title}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.text}`}>
            {benefit.category}
          </span>
          {isUrgent && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-200 text-amber-900">
              D-{daysLeft}
            </span>
          )}
        </div>
        {benefit.amount && (
          <p className="text-sm font-bold text-indigo-700 mt-0.5">{benefit.amount}</p>
        )}
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{benefit.summary}</p>
      </div>
      {computedStatus === "missed" ? (
        <span className="text-lg shrink-0" title="놓친 혜택">
          {ageDays > (benefit.applyWindowDays ?? 0) && benefit.isOneTime ? "😢" : "⏰"}
        </span>
      ) : (
        <a
          href={benefit.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap mt-1"
        >
          신청 →
        </a>
      )}
    </div>
  );
}

export default function Dashboard() {
  const now = new Date();
  const ageMonths = getAgeInMonths(MANGO_BIRTHDAY, now);
  const ageDays = getAgeInDays(MANGO_BIRTHDAY, now);
  const ageText = formatAge(MANGO_BIRTHDAY, now);

  const categorized = useMemo(() => {
    const active: typeof benefits = [];
    const missed: typeof benefits = [];
    const upcoming: typeof benefits = [];
    const conditional: typeof benefits = [];

    for (const b of benefits) {
      const cs = computeBenefitStatus(b, ageMonths, ageDays);
      if (cs === "active") active.push(b);
      else if (cs === "missed") missed.push(b);
      else if (cs === "upcoming") upcoming.push(b);
      else conditional.push(b);
    }
    return { active, missed, upcoming, conditional };
  }, [ageMonths, ageDays]);

  const totalAmount = useMemo(() => {
    // 현재 받을 수 있는 월 정기 혜택 합산 (대략적)
    const monthly = [
      categorized.active.find(b => b.id === "parent-benefit-0") ? 100 : 0,
      categorized.active.find(b => b.id === "parent-benefit-1") ? 50 : 0,
      categorized.active.find(b => b.id === "child-allowance") ? 10.5 : 0,
    ];
    return monthly.reduce((a, b) => a + b, 0);
  }, [categorized.active]);

  return (
    <div className="flex flex-col gap-5">
      {/* 망고 정보 카드 */}
      <div className="bg-gradient-to-r from-pink-50 to-purple-50 border border-purple-100 rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <div className="text-4xl">🥭</div>
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-0.5">망고 현재 나이</p>
            <p className="text-2xl font-extrabold text-gray-900">{ageText}</p>
            <p className="text-xs text-gray-500">
              2025년 7월 28일 생 · 현재 {ageMonths}개월 {ageDays - ageMonths * 30}일
            </p>
          </div>
          {totalAmount > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-0.5">매월 받을 수 있는 금액</p>
              <p className="text-xl font-extrabold text-emerald-600">
                약 {totalAmount.toLocaleString()}만원
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 받을 수 있는 혜택 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">✅</span>
          <h2 className="font-bold text-gray-900">지금 받을 수 있어요</h2>
          <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded-full">
            {categorized.active.length}개
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {categorized.active.map(b => (
            <BenefitRow
              key={b.id}
              benefit={b}
              computedStatus="active"
              ageMonths={ageMonths}
              ageDays={ageDays}
            />
          ))}
        </div>
      </section>

      {/* 조건부 혜택 */}
      {categorized.conditional.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📋</span>
            <h2 className="font-bold text-gray-900">조건 확인 필요</h2>
            <span className="bg-rose-100 text-rose-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {categorized.conditional.length}개
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {categorized.conditional.map(b => (
              <BenefitRow
                key={b.id}
                benefit={b}
                computedStatus="conditional"
                ageMonths={ageMonths}
                ageDays={ageDays}
              />
            ))}
          </div>
        </section>
      )}

      {/* 놓친 혜택 */}
      {categorized.missed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">😢</span>
            <h2 className="font-bold text-gray-900">놓친 혜택</h2>
            <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {categorized.missed.length}개
            </span>
          </div>
          <p className="text-xs text-red-600 mb-2 bg-red-50 rounded-lg px-3 py-2">
            신청 기간이 지났거나 해당 연령대가 끝났어요. 일부는 늦은 신청도 가능할 수 있으니 주민센터에 직접 확인해보세요.
          </p>
          <div className="flex flex-col gap-2">
            {categorized.missed.map(b => (
              <BenefitRow
                key={b.id}
                benefit={b}
                computedStatus="missed"
                ageMonths={ageMonths}
                ageDays={ageDays}
              />
            ))}
          </div>
        </section>
      )}

      {/* 예정 혜택 */}
      {categorized.upcoming.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔮</span>
            <h2 className="font-bold text-gray-900">앞으로 받을 수 있어요</h2>
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {categorized.upcoming.length}개
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {categorized.upcoming.map(b => (
              <BenefitRow
                key={b.id}
                benefit={b}
                computedStatus="upcoming"
                ageMonths={ageMonths}
                ageDays={ageDays}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export { statusLabel };
