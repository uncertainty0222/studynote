"use client";

import { useState } from "react";
import type { PaymentRequest } from "@/lib/members";

const STATUS: Record<string, string> = { pending: "대기", approved: "승인", rejected: "거절" };

function fmt(t: number | null) {
  if (!t) return "-";
  const d = new Date(t);
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AdminRequests({ initial }: { initial: PaymentRequest[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function decide(id: number, approve: boolean) {
    if (!approve && !confirm("이 요청을 거절할까요?")) return;
    setBusy(id);
    setError("");
    const res = await fetch("/api/admin/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, approve }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (data.ok) window.location.reload();
    else {
      setError(data.error ?? "처리하지 못했습니다.");
      setBusy(null);
    }
  }

  if (initial.length === 0) return <p className="text-zinc-500">아직 요청이 없습니다.</p>;
  return (
    <div>
      {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
      <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {initial.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {r.payerName || "(이름 없음)"} <span className="text-sm font-normal text-zinc-500">· 카카오 {r.nickname || r.kakaoId}</span>
              </p>
              <p className="text-xs text-zinc-500">
                요청 {fmt(r.createdAt)} · 상태 {STATUS[r.status] ?? r.status} · 이용 기한 {fmt(r.premiumUntil)}
              </p>
            </div>
            {r.status === "pending" && (
              <div className="flex gap-2">
                <button
                  disabled={busy !== null}
                  onClick={() => decide(r.id, true)}
                  className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
                >
                  승인 (30일)
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() => decide(r.id, false)}
                  className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-semibold disabled:opacity-40 dark:border-zinc-700"
                >
                  거절
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
