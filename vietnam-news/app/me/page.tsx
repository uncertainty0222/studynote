import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { SITE_NAME } from "@/lib/labels";
import MarketHeader from "../market/MarketHeader";
import ProfileEditor from "../_components/ProfileEditor";
import AccountActions from "./AccountActions";

export const dynamic = "force-dynamic";
export const metadata = { title: `내 정보 · ${SITE_NAME}`, robots: { index: false } };

const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString("ko-KR", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "long", day: "numeric" });

const stillActive = (until: number | null) => until != null && until > Date.now();

// /me — 내 별명·프로필, 멤버십 기간, 로그아웃, 탈퇴
export default async function MePage() {
  const access = await getAccess();
  const m = access.member;
  if (!m) redirect(access.loginEnabled ? "/api/auth/kakao" : "/");
  const proActive = stillActive(m.premiumUntil);

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <MarketHeader member={m} loginEnabled />
      <main className="mx-auto max-w-md px-5 pb-24 pt-8">
        <h1 className="sr-only">내 정보</h1>
        <ProfileEditor alias={m.alias} avatar={m.avatar} />

        <dl className="mt-8 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 text-sm dark:divide-zinc-900 dark:border-zinc-800">
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-zinc-500">로그인</dt>
            <dd className="font-medium">카카오톡</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-zinc-500">가입일</dt>
            <dd className="font-medium">{fmtDate(m.joinedAt)}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-zinc-500">PRO 멤버십</dt>
            <dd className="font-medium">{proActive ? `${fmtDate(m.premiumUntil!)}까지` : m.pending ? "승인 대기 중" : "이용 안 함"}</dd>
          </div>
        </dl>

        <AccountActions admin={m.admin} proActive={proActive} />
      </main>
    </div>
  );
}
