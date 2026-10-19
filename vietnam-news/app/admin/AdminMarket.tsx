"use client";

import { useState } from "react";
import type { ReportedItem } from "@/lib/market";

// 신고된 장터 글: 되살리기(신고 기록 삭제) 또는 지우기
export default function AdminMarket({ initial }: { initial: ReportedItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState("");

  async function act(id: number, action: "restore" | "delete") {
    if (action === "delete" && !confirm("이 글을 지울까요?")) return;
    const res = await fetch("/api/admin/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (data.ok) setItems((list) => list.filter((it) => it.id !== id));
    else setError(data.error ?? "처리하지 못했습니다.");
  }

  if (items.length === 0) return <p className="text-zinc-500">신고된 글이 없습니다.</p>;
  return (
    <div>
      {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
      <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {items.map((it) => (
          <li key={it.id} className="px-4 py-3.5">
            <a href={`/market/${it.id}`} className="font-semibold underline underline-offset-2">
              {it.title}
            </a>
            <p className="mt-0.5 text-xs text-zinc-500">
              신고 {it.reports}건 · {it.hidden ? "숨김" : "공개 중"}
              {it.reasons.length > 0 && ` · ${it.reasons.slice(0, 3).join(" / ")}`}
            </p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => act(it.id, "restore")} className="h-8 rounded-lg border border-zinc-300 px-3 text-sm font-semibold dark:border-zinc-700">
                문제없음 (되살리기)
              </button>
              <button onClick={() => act(it.id, "delete")} className="h-8 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white">
                지우기
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
