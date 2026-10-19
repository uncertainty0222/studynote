"use client";

import { useState } from "react";

const STATUS_LABEL = { selling: "판매중", reserved: "예약중", sold: "판매완료" } as const;
type Status = keyof typeof STATUS_LABEL;

// 관심·신고 (회원), 상태 변경·삭제 (작성자·운영자)
export default function ItemActions({
  id,
  loggedIn,
  liked: initialLiked,
  canManage,
  isOwner,
  status: initialStatus,
  bump,
}: {
  id: number;
  loggedIn: boolean;
  liked: boolean;
  canManage: boolean;
  isOwner: boolean;
  status: Status;
  bump: { nextAt: number; left: number; expired: boolean };
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [msg, setMsg] = useState("");

  async function call(url: string, init: RequestInit) {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; liked?: boolean };
    if (!data.ok) throw new Error(data.error ?? "처리하지 못했어요.");
    return data;
  }

  async function like() {
    if (!loggedIn) return (window.location.href = "/api/auth/kakao?next=market");
    try {
      setLiked(Boolean((await call(`/api/market/items/${id}/like`, { method: "POST" })).liked));
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function report() {
    if (!loggedIn) return (window.location.href = "/api/auth/kakao?next=market");
    const reason = prompt("신고 사유를 적어 주세요. (예: 사기 의심, 금지 물품, 광고)");
    if (reason === null) return;
    try {
      await call(`/api/market/items/${id}/report`, { method: "POST", body: JSON.stringify({ reason }) });
      setMsg("신고가 접수됐어요. 운영자가 확인할게요.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function changeStatus(next: Status) {
    try {
      await call(`/api/market/items/${id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      setStatus(next);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  // 끌어올리기 가능 여부는 화면을 연 시각 기준 (서버에서 다시 확인한다)
  const [now] = useState(() => Date.now());
  const [bumped, setBumped] = useState(false);
  const hoursLeft = Math.ceil((bump.nextAt - now) / 3600_000);
  const canBump = !bumped && status !== "sold" && bump.left > 0 && hoursLeft <= 0;

  async function doBump() {
    try {
      await call(`/api/market/items/${id}/bump`, { method: "POST" });
      setBumped(true);
      setMsg("끌어올렸어요. 목록 맨 위에 보여요.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function remove() {
    if (!confirm("이 글을 지울까요? 되돌릴 수 없어요.")) return;
    try {
      await call(`/api/market/items/${id}`, { method: "DELETE" });
      window.location.href = "/market";
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <button
          onClick={like}
          aria-pressed={liked}
          className={`h-11 flex-1 rounded-xl border text-sm font-semibold ${
            liked ? "border-rose-600 text-rose-600" : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
          }`}
        >
          {liked ? "♥ 관심 목록에 있어요" : "♡ 관심"}
        </button>
        {!canManage && (
          <button onClick={report} className="h-11 shrink-0 rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-500 dark:border-zinc-700">
            신고
          </button>
        )}
      </div>

      {canManage && (
        <div className="mt-4 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900">
          <p className="text-[13px] font-semibold text-zinc-500">거래 상태</p>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-zinc-200/60 p-1 dark:bg-zinc-800">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                aria-pressed={status === s}
                className={`h-9 rounded-lg text-sm font-semibold ${
                  status === s ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-500"
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {isOwner && (
            <div className="mt-4">
              <button
                onClick={doBump}
                disabled={!canBump}
                className="h-10 w-full rounded-xl bg-zinc-900 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
              >
                ⬆ 끌어올리기 {bump.left > 0 && !bumped ? `(남은 ${bump.left}번)` : ""}
              </button>
              <p className="mt-1.5 text-xs text-zinc-500">
                {bumped
                  ? "24시간 뒤에 다시 끌어올릴 수 있어요."
                  : status === "sold"
                    ? "판매완료 글은 끌어올릴 수 없어요."
                    : bump.left <= 0
                      ? "이 글은 끌어올리기를 모두 썼어요. 새 글로 올려 주세요."
                      : hoursLeft > 0
                        ? `${hoursLeft}시간 뒤에 끌어올릴 수 있어요. (24시간에 한 번)`
                        : bump.expired
                          ? "30일 동안 끌어올리지 않아 목록에서 빠진 글이에요. 끌어올리면 다시 보여요."
                          : "목록 맨 위로 다시 올려요. 24시간에 한 번, 글당 10번까지."}
              </p>
            </div>
          )}
          <button onClick={remove} className="mt-3 text-[13px] font-medium text-rose-600 underline underline-offset-2">
            글 삭제
          </button>
        </div>
      )}

      {msg && <p className="mt-3 text-center text-[13px] text-zinc-500">{msg}</p>}
    </div>
  );
}
