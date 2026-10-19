import Link from "next/link";

// 상단 바 아래 '주간 뉴스 | 나트랑 장터' 전환
export default function SiteTabs({ active }: { active: "news" | "market" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`relative py-2.5 text-[15px] font-bold tracking-tight ${
        on ? "text-zinc-900 dark:text-white" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      }`}
    >
      {label}
      {on && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-zinc-900 dark:bg-white" />}
    </Link>
  );
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex max-w-2xl gap-6 px-5" aria-label="서비스">
        {tab("/", "주간 뉴스", active === "news")}
        {tab("/market", "나트랑 장터", active === "market")}
      </nav>
    </div>
  );
}
