import Link from "next/link";

// 상단 바 아래 '주간 뉴스 | 나트랑 장터' 전환. 장터 탭은 뉴스 화면에서 눈에 띄게 (최근 하루 새 글 수)
export default function SiteTabs({ active, marketNew = 0 }: { active: "news" | "market"; marketNew?: number }) {
  const tab = (href: string, icon: string, label: string, on: boolean, badge?: string) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`relative flex items-center gap-1.5 py-3 text-[15px] font-bold tracking-tight ${
        on ? "text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
      }`}
    >
      <span aria-hidden className={`text-base leading-none ${on ? "" : "opacity-80"}`}>
        {icon}
      </span>
      {label}
      {badge && (
        <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white shadow-sm shadow-rose-600/30">
          {badge}
        </span>
      )}
      {on && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-rose-600" />}
    </Link>
  );
  const marketBadge = active === "market" ? undefined : marketNew > 0 ? `새 글 ${marketNew > 99 ? "99+" : marketNew}` : "NEW";
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex max-w-2xl gap-6 px-5" aria-label="서비스">
        {tab("/", "📰", "주간 뉴스", active === "news")}
        {tab("/market", "🛍️", "나트랑 장터", active === "market", marketBadge)}
      </nav>
    </div>
  );
}
