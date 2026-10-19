"use client";

import { useState } from "react";
import Avatar from "./Avatar";

// 내 별명·프로필 그림 + 다시 뽑기
export default function ProfileEditor({ alias: initialAlias, avatar: initialAvatar }: { alias: string; avatar: string }) {
  const [profile, setProfile] = useState({ alias: initialAlias, avatar: initialAvatar });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reroll() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/profile", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; alias?: string; avatar?: string; error?: string };
      if (!data.ok || !data.alias) throw new Error(data.error ?? "다시 뽑지 못했어요.");
      setProfile({ alias: data.alias, avatar: data.avatar ?? "" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center text-center">
      <Avatar key={profile.avatar} avatar={profile.avatar} size={96} className="animate-pop shadow-sm" />
      <p className="mt-4 text-[22px] font-extrabold tracking-tight">{profile.alias}</p>
      <button
        onClick={reroll}
        disabled={busy}
        className="mt-3 h-9 rounded-full border border-zinc-300 px-4 text-[13px] font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
      >
        🎲 {busy ? "뽑는 중…" : "다시 뽑기"}
      </button>
      {error && <p className="mt-2 text-[13px] text-rose-600">{error}</p>}
    </div>
  );
}
