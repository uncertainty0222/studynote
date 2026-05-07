"use client";

import { Benefit, categoryColors, statusColors } from "@/data/benefits";

interface Props {
  benefit: Benefit;
}

export default function BenefitCard({ benefit }: Props) {
  const cat = categoryColors[benefit.category];
  const st = statusColors[benefit.status];

  return (
    <div className={`rounded-2xl border ${cat.border} ${cat.bg} p-5 flex flex-col gap-3 hover:shadow-md transition-shadow`}>
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-bold text-gray-900 leading-snug">{benefit.title}</h2>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cat.bg} ${cat.text} border ${cat.border}`}>
            {benefit.category}
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
            {benefit.status}
          </span>
        </div>
      </div>

      {/* amount highlight */}
      {benefit.amount && (
        <div className="bg-white rounded-xl px-4 py-2 border border-gray-100">
          <span className="text-xs text-gray-500 block mb-0.5">지원 금액·혜택</span>
          <span className="text-sm font-bold text-gray-800">{benefit.amount}</span>
        </div>
      )}

      {/* summary */}
      <p className="text-sm text-gray-700 leading-relaxed">{benefit.summary}</p>

      {/* details */}
      <dl className="text-sm space-y-1.5">
        <div className="flex gap-2">
          <dt className="shrink-0 font-medium text-gray-500 w-16">대상</dt>
          <dd className="text-gray-700">{benefit.target}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-medium text-gray-500 w-16">신청</dt>
          <dd className="text-gray-700">{benefit.howToApply}</dd>
        </div>
        {benefit.deadline && (
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-gray-500 w-16">기한</dt>
            <dd className="text-amber-700 font-medium">{benefit.deadline}</dd>
          </div>
        )}
        {benefit.notes && (
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-gray-500 w-16">메모</dt>
            <dd className="text-gray-600 text-xs leading-relaxed">{benefit.notes}</dd>
          </div>
        )}
      </dl>

      {/* tags + link */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        <div className="flex flex-wrap gap-1">
          {benefit.tags.map((tag) => (
            <span key={tag} className="text-xs bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
              #{tag}
            </span>
          ))}
        </div>
        <a
          href={benefit.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-blue-600 hover:underline shrink-0"
        >
          공식 사이트 →
        </a>
      </div>
    </div>
  );
}
