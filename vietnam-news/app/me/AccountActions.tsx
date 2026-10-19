"use client";

import Link from "next/link";
import { useState } from "react";

// 내 정보 아래쪽: 운영자 화면, 로그아웃, 회원 탈퇴
export default function AccountActions({ admin, proActive }: { admin: boolean; proActive: boolean }) {
  const [error, setError] = useState("");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function withdraw() {
    const warn = [
      "탈퇴하면 별명, 장터에 올린 글과 사진, 관심 목록이 모두 지워지고 되돌릴 수 없어요.",
      proActive ? "남은 PRO 멤버십 기간도 사라져요." : "",
      "카카오 확인 화면을 거쳐 탈퇴할까요?",
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!confirm(warn)) return;
    setError("");
    const res = await fetch("/api/account/withdraw", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    if (!data.ok || !data.url) return setError(data.error ?? "탈퇴를 시작하지 못했어요.");
    window.location.href = data.url;
  }

  const row = "flex h-12 w-full items-center px-4 text-left text-sm font-medium";
  return (
    <div className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
      <Link href="/market?view=mine" className={row}>
        내가 올린 장터 글
      </Link>
      {admin && (
        <Link href="/admin" className={row}>
          운영자 · 멤버십 승인
        </Link>
      )}
      <button onClick={logout} className={row}>
        로그아웃
      </button>
      <button onClick={withdraw} className={`${row} text-zinc-400`}>
        회원 탈퇴
      </button>
      {error && <p className="px-4 py-3 text-[13px] text-rose-600">{error}</p>}
    </div>
  );
}
