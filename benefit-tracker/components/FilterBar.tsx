"use client";

import { BenefitCategory, BenefitStatus } from "@/data/benefits";

const CATEGORIES: (BenefitCategory | "전체")[] = ["전체", "국가지원", "창원시", "다문화가족", "예정정책"];
const STATUSES: (BenefitStatus | "전체")[] = ["전체", "신청가능", "진행중", "조건부", "예정"];

interface Props {
  selectedCategory: BenefitCategory | "전체";
  selectedStatus: BenefitStatus | "전체";
  onCategoryChange: (c: BenefitCategory | "전체") => void;
  onStatusChange: (s: BenefitStatus | "전체") => void;
  totalCount: number;
  filteredCount: number;
}

export default function FilterBar({
  selectedCategory,
  selectedStatus,
  onCategoryChange,
  onStatusChange,
  totalCount,
  filteredCount,
}: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-semibold text-gray-500 w-12">카테고리</span>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => onCategoryChange(c as BenefitCategory | "전체")}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
              selectedCategory === c
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-semibold text-gray-500 w-12">상태</span>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(s as BenefitStatus | "전체")}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
              selectedStatus === s
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400">
        전체 {totalCount}개 중 <span className="font-semibold text-gray-700">{filteredCount}개</span> 표시
      </p>
    </div>
  );
}
