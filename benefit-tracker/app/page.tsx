"use client";

import { useState } from "react";
import { benefits, categoryColors } from "@/data/benefits";
import { getAgeInMonths, getAgeInDays, computeBenefitStatus } from "@/lib/ageUtils";
import BenefitCard from "@/components/BenefitCard";
import FilterBar from "@/components/FilterBar";
import Dashboard from "@/components/Dashboard";
import NewsTab from "@/components/NewsTab";
import type { BenefitCategory, BenefitStatus } from "@/data/benefits";

type Tab = "대시보드" | "전체혜택" | "뉴스";

const now = new Date();
const ageMonths = getAgeInMonths(undefined, now);
const ageDays = getAgeInDays(undefined, now);

export default function Home() {
  const [tab, setTab] = useState<Tab>("대시보드");
  const [selectedCategory, setSelectedCategory] = useState<BenefitCategory | "전체">("전체");
  const [selectedStatus, setSelectedStatus] = useState<BenefitStatus | "전체">("전체");

  const activeCount = benefits.filter(
    b => computeBenefitStatus(b, ageMonths, ageDays) === "active"
  ).length;
  const missedCount = benefits.filter(
    b => computeBenefitStatus(b, ageMonths, ageDays) === "missed"
  ).length;

  const filtered = benefits.filter((b) => {
    const catMatch = selectedCategory === "전체" || b.category === selectedCategory;
    const stMatch = selectedStatus === "전체" || b.status === selectedStatus;
    return catMatch && stMatch;
  });

  return (
    <div className="min-h-screen">
      {/* 헤더 */}
      <header className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-white">
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-0">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1 text-xs font-semibold mb-3">
            창원 거주 · 한국인 아빠 · 베트남인 엄마 · 망고
          </div>
          <h1 className="text-2xl font-extrabold leading-tight mb-1">
            우리 가족 혜택 모아보기 🥭
          </h1>
          <p className="text-sm text-white/80 mb-4">
            국가·창원시·다문화가족 지원 정책을 한 곳에서 확인하세요
          </p>

          {/* 요약 통계 */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "지금 받을 수 있음", count: activeCount, color: "bg-emerald-400/30" },
              { label: "놓친 혜택", count: missedCount, color: "bg-red-400/30" },
              { label: "전체 혜택", count: benefits.length, color: "bg-white/20" },
            ].map((item) => (
              <div key={item.label} className={`${item.color} rounded-xl px-3 py-3 text-center`}>
                <div className="text-xl font-bold">{item.count}</div>
                <div className="text-xs text-white/80">{item.label}</div>
              </div>
            ))}
          </div>

          {/* 탭 */}
          <div className="flex gap-1">
            {(["대시보드", "전체혜택", "뉴스"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-colors cursor-pointer ${
                  tab === t
                    ? "bg-white text-gray-900"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {t}
                {t === "뉴스" && <span className="ml-1 text-xs opacity-60">Beta</span>}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* ── 대시보드 탭 ─── */}
        {tab === "대시보드" && <Dashboard />}

        {/* ── 전체혜택 탭 ─── */}
        {tab === "전체혜택" && (
          <div className="flex flex-col gap-4">
            {/* 카테고리 빠른 이동 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["국가지원", "창원시", "다문화가족", "예정정책"] as BenefitCategory[]).map((cat) => {
                const c = categoryColors[cat];
                const count = benefits.filter(b => b.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? `${c.bg} ${c.border} ring-2 ring-offset-1 ring-${c.text.replace("text-", "")}`
                        : "bg-white border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div className={`text-lg font-bold ${c.text}`}>{count}</div>
                    <div className="text-xs text-gray-600">{cat}</div>
                  </button>
                );
              })}
            </div>

            <FilterBar
              selectedCategory={selectedCategory}
              selectedStatus={selectedStatus}
              onCategoryChange={setSelectedCategory}
              onStatusChange={setSelectedStatus}
              totalCount={benefits.length}
              filteredCount={filtered.length}
            />

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                해당 조건의 혜택이 없습니다.
              </div>
            ) : (
              <div className="grid gap-4">
                {filtered.map((b) => (
                  <BenefitCard key={b.id} benefit={b} ageMonths={ageMonths} ageDays={ageDays} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 뉴스 탭 ─── */}
        {tab === "뉴스" && <NewsTab />}
      </main>

      <footer className="text-center text-xs text-gray-400 py-8 border-t border-gray-100 mt-4">
        <p>정보는 2026년 5월 기준. 최신 내용은 공식 사이트에서 확인하세요.</p>
        <p className="mt-1">
          <a href="https://www.danuri.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">다누리</a>
          {" · "}
          <a href="https://www.bokjiro.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">복지로</a>
          {" · "}
          <a href="https://www.changwon.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">창원특례시청</a>
        </p>
      </footer>
    </div>
  );
}
