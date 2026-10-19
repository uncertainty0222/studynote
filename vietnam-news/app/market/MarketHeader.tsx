"use client";

import Link from "next/link";
import { SITE_NAME } from "@/lib/labels";

// 장터 화면 상단 바: 사이트 이름 + 카카오 로그인/로그아웃
export default function MarketHeader({ nickname, loggedIn, loginEnabled }: { nickname: string; loggedIn: boolean; loginEnabled: boolean }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-5">
        <Link href="/" className="whitespace-nowrap text-[17px] font-extrabold tracking-tight">
          {SITE_NAME}
        </Link>
        {loginEnabled &&
          (loggedIn ? (
            <div className="flex items-center gap-2 text-[13px]">
              <span className="max-w-[8rem] truncate font-semibold">{nickname || "내 계정"}</span>
              <button onClick={logout} className="text-zinc-500 underline underline-offset-2">
                로그아웃
              </button>
            </div>
          ) : (
            <a
              href="/api/auth/kakao?next=market"
              className="flex h-8 items-center gap-1 whitespace-nowrap rounded-full bg-[#FEE500] px-3 text-[13px] font-semibold text-black/85"
            >
              카카오톡 로그인
            </a>
          ))}
      </div>
    </header>
  );
}
