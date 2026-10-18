import { getAccess } from "@/lib/access";
import { headers } from "next/headers";
import { listRequests, siteUrlFromHeaders } from "@/lib/members";
import { SITE_NAME } from "@/lib/labels";
import AdminRequests from "./AdminRequests";

export const dynamic = "force-dynamic";
export const metadata = { title: `운영자 · ${SITE_NAME}`, robots: { index: false } };

// /admin — 운영자: 카카오페이 송금 확인 요청을 승인(30일)하거나 거절한다
export default async function AdminPage() {
  const access = await getAccess();
  const m = access.member;

  let body: React.ReactNode;
  if (!access.loginEnabled) {
    body = <p>로그인이 아직 설정되지 않았습니다. (DATABASE_URL, KAKAO_REST_API_KEY 필요)</p>;
  } else if (!m) {
    body = (
      <a href="/api/auth/kakao" className="inline-flex h-11 items-center rounded-xl bg-[#FEE500] px-5 font-semibold text-black/85">
        카카오로 로그인
      </a>
    );
  } else if (!m.admin) {
    body = (
      <p>
        운영자로 등록되지 않은 계정입니다. 이 계정이 운영자라면 Railway Variables의 <code>ADMIN_KAKAO_IDS</code>에 회원번호{" "}
        <b className="select-all font-mono">{m.id}</b> 를 넣고 다시 배포하세요.
      </p>
    );
  } else {
    body = <AdminRequests initial={await listRequests()} />;
  }

  const redirectUri = `${siteUrlFromHeaders(await headers())}/api/auth/kakao/callback`;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-10 text-[15px] text-zinc-800 dark:text-zinc-200">
      <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">{SITE_NAME} 운영자</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">멤버십 승인</h1>
      <p className="mt-2 text-sm text-zinc-500">카카오페이에서 입금을 확인한 뒤 승인하세요. 승인하면 30일이 열리고, 남은 기간이 있으면 그 뒤로 이어집니다.</p>
      <div className="mt-8">{body}</div>
      <div className="mt-10 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
        <p className="font-semibold">카카오 콘솔에 등록할 리다이렉트 URI</p>
        <p className="mt-1 break-all font-mono text-[13px] select-all">{redirectUri}</p>
        <p className="mt-1 text-xs text-zinc-500">
          카카오 디벨로퍼스 → 앱 → 플랫폼 키 → REST API 키 → 카카오 로그인 리다이렉트 URI에 이 값을 한 글자도 다르지 않게 등록하세요. 다르면 KOE006 오류가 납니다.
        </p>
      </div>
    </main>
  );
}
