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

  async function samples(action: "seed" | "clearSeed") {
    const res = await fetch("/api/admin/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; removed?: number };
    setError(data.ok ? (action === "seed" ? "테스트 글 5개를 올렸어요. 장터에서 확인하세요." : `테스트 글 ${data.removed ?? 0}개를 지웠어요.`) : (data.error ?? "처리하지 못했습니다."));
  }

  const sampleButtons = (
    <div className="mb-4 flex flex-wrap gap-2">
      <button onClick={() => samples("seed")} className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-semibold dark:border-zinc-700">
        테스트 글 5개 넣기
      </button>
      <button onClick={() => samples("clearSeed")} className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-semibold text-rose-600 dark:border-zinc-700">
        테스트 글 모두 지우기
      </button>
    </div>
  );

  if (items.length === 0)
    return (
      <div>
        {sampleButtons}
        {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
        <p className="text-zinc-500">신고된 글이 없습니다.</p>
      </div>
    );
  return (
    <div>
      {sampleButtons}
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
