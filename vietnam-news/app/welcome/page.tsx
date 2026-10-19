import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { SITE_NAME } from "@/lib/labels";
import Avatar from "../_components/Avatar";

export const dynamic = "force-dynamic";
export const metadata = { title: `환영합니다 · ${SITE_NAME}`, robots: { index: false } };

// /welcome — 카카오로 처음 가입한 회원에게 별명·프로필 그림을 소개한다
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const access = await getAccess();
  if (!access.member) redirect("/");
  const asked = (await searchParams).next ?? "/";
  // 사이트 안 주소로만 보낸다
  const next = asked.startsWith("/") && !asked.startsWith("//") ? asked : "/";

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-5 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="w-full max-w-sm py-12 text-center">
        <p className="text-[13px] font-semibold text-rose-600">가입 완료</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{SITE_NAME}에 오신 걸 환영해요</h1>
        <p className="mt-2 break-keep text-sm text-zinc-500">무작위로 정해진 내 별명과 그림이에요.</p>

        <div className="mt-8 rounded-3xl border border-zinc-200 px-6 py-8 dark:border-zinc-800">
          <div className="flex flex-col items-center">
            <Avatar avatar={access.member.avatar} size={96} className="animate-pop shadow-sm" />
            <p className="mt-4 text-[22px] font-extrabold tracking-tight">{access.member.alias}</p>
          </div>
        </div>

        <ul className="mt-6 space-y-1.5 break-keep text-left text-[13px] leading-relaxed text-zinc-500">
          <li>· 카카오 닉네임과 프로필 사진은 다른 회원에게 보이지 않아요.</li>
          <li>· 별명과 그림은 이 카카오 계정에 고정돼 바꿀 수 없어요. 탈퇴 후 다시 가입해도 같아요.</li>
        </ul>

        <Link
          href={next}
          className="mt-8 flex h-12 items-center justify-center rounded-xl bg-zinc-900 text-[15px] font-bold text-white dark:bg-white dark:text-zinc-900"
        >
          시작하기
        </Link>
      </main>
    </div>
  );
}
