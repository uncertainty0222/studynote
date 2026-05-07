"use client";

import { useState } from "react";
import { benefits, BenefitCategory, BenefitStatus } from "@/data/benefits";
import BenefitCard from "@/components/BenefitCard";
import FilterBar from "@/components/FilterBar";

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<BenefitCategory | "전체">("전체");
  const [selectedStatus, setSelectedStatus] = useState<BenefitStatus | "전체">("전체");

  const filtered = benefits.filter((b) => {
    const catMatch = selectedCategory === "전체" || b.category === selectedCategory;
    const stMatch = selectedStatus === "전체" || b.status === selectedStatus;
    return catMatch && stMatch;
  });

  return (
    <div className="min-h-screen">
      {/* hero */}
      <header className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-white">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1 text-xs font-semibold mb-4">
            창원 거주 · 다문화가정 · 영아 10개월
          </div>
          <h1 className="text-2xl font-extrabold leading-tight mb-2">
            우리 가족 혜택 모아보기
          </h1>
          <p className="text-sm text-white/80 leading-relaxed mb-6">
            한국인 아빠 · 베트남인 엄마 · 아들(10개월)을 위한<br />
            국가·창원시·다문화가족 지원 정책을 한 곳에 정리했어요.
          </p>

          {/* quick summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "국가지원", count: benefits.filter((b) => b.category === "국가지원").length },
              { label: "창원시", count: benefits.filter((b) => b.category === "창원시").length },
              { label: "다문화가족", count: benefits.filter((b) => b.category === "다문화가족").length },
              { label: "예정정책", count: benefits.filter((b) => b.category === "예정정책").length },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setSelectedCategory(item.label as BenefitCategory);
                  setSelectedStatus("전체");
                }}
                className="bg-white/15 hover:bg-white/25 transition-colors rounded-xl px-3 py-3 text-center cursor-pointer"
              >
                <div className="text-xl font-bold">{item.count}</div>
                <div className="text-xs text-white/80">{item.label}</div>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
          <strong>꼭 확인하세요!</strong> 아들이 현재 10개월이라면{" "}
          <span className="font-semibold">부모급여(월 100만원)</span>와{" "}
          <span className="font-semibold">아동수당(월 10.5만원)</span>을 이미 받고 있어야 해요.
          아직 신청 안 하셨다면 지금 바로 주민센터 방문하세요!
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
              <BenefitCard key={b.id} benefit={b} />
            ))}
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-8 border-t border-gray-100 mt-4">
        <p>정보는 2026년 5월 기준입니다. 정책은 변경될 수 있으니 공식 사이트에서 최신 내용을 확인하세요.</p>
        <p className="mt-1">
          <a href="https://www.danuri.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
            다누리 (다문화가족 포털)
          </a>
          {" · "}
          <a href="https://www.bokjiro.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
            복지로
          </a>
          {" · "}
          <a href="https://www.changwon.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
            창원특례시청
          </a>
        </p>
      </footer>
    </div>
  );
}
