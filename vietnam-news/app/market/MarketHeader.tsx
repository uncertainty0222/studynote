import Link from "next/link";
import { SITE_NAME } from "@/lib/labels";
import Avatar from "../_components/Avatar";

// 장터·내 정보 화면 상단 바: 사이트 이름 + 카카오 로그인 / 내 프로필
export default function MarketHeader({
  member,
  loginEnabled,
  loginNext = "market",
}: {
  member: { alias: string; avatar: string } | null;
  loginEnabled: boolean;
  loginNext?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-5">
        <Link href="/" className="whitespace-nowrap text-[17px] font-extrabold tracking-tight">
          {SITE_NAME}
        </Link>
        {loginEnabled &&
          (member ? (
            <Link
              href="/me"
              aria-label={`${member.alias} · 내 정보`}
              className="flex h-8 max-w-[11rem] items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-200 pl-1 pr-3 text-[13px] font-semibold dark:border-zinc-700"
            >
              <Avatar avatar={member.avatar} size={24} />
              <span className="truncate">{member.alias}</span>
            </Link>
          ) : (
            <a
              href={`/api/auth/kakao?next=${loginNext}`}
              className="flex h-8 items-center gap-1 whitespace-nowrap rounded-full bg-[#FEE500] px-3 text-[13px] font-semibold text-black/85"
            >
              카카오톡 로그인
            </a>
          ))}
      </div>
    </header>
  );
}
