import Link from "next/link";
import { getAccess } from "@/lib/access";
import { CATEGORIES, listItems, STATUSES } from "@/lib/market";
import SiteTabs from "../_components/SiteTabs";
import MarketHeader from "./MarketHeader";
import { formatPrice, timeAgo } from "./format";

export const dynamic = "force-dynamic";
export const metadata = { title: "나트랑 장터 · 주간베트남", description: "나트랑 교민 중고거래" };

type Search = { q?: string; cat?: string; free?: string; sold?: string; view?: string };

// /market — 나트랑 교민 중고거래 목록
export default async function MarketPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const access = await getAccess();
  const me = access.member;
  const enabled = access.loginEnabled; // 장터는 회원 DB가 있어야 동작한다
  const view = sp.view === "mine" || sp.view === "liked" ? sp.view : null;
  const category = CATEGORIES.includes(sp.cat as (typeof CATEGORIES)[number]) ? sp.cat : undefined;

  const items =
    enabled && (!view || me)
      ? await listItems({
          q: sp.q,
          category,
          free: sp.free === "1",
          hideSold: sp.sold === "hide",
          mine: view === "mine" ? me!.id : undefined,
          liked: view === "liked" ? me!.id : undefined,
        }).catch(() => null)
      : [];

  // 현재 조건을 유지한 채 한 가지만 바꾼 주소
  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return `/market${qs ? `?${qs}` : ""}`;
  };
  const chip = (on: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
      on
        ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
        : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
    }`;

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <MarketHeader member={me} loginEnabled={enabled} />
      <SiteTabs active="market" />

      <main className="mx-auto max-w-2xl px-5 pb-28">
        <section className="pt-6">
          <h1 className="text-[22px] font-bold tracking-tight">나트랑 장터</h1>
          <p className="mt-1 break-keep text-[13px] text-zinc-500">나트랑 교민끼리 사고팔고 나누는 중고거래방. 거래 연락은 카카오톡으로 해요.</p>
        </section>

        {!enabled ? (
          <p className="mt-8 rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
            장터를 준비 중입니다. (운영자: DATABASE_URL, KAKAO_REST_API_KEY 설정 필요)
          </p>
        ) : (
          <>
            <form action="/market" className="mt-5 flex gap-2">
              {category && <input type="hidden" name="cat" value={category} />}
              <input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="물건 이름으로 찾기"
                className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-transparent px-3.5 text-[15px] outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-300"
              />
              <button className="h-11 shrink-0 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">검색</button>
            </form>

            <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
              <Link href={href({ cat: undefined })} className={chip(!category)}>
                전체
              </Link>
              {CATEGORIES.map((c) => (
                <Link key={c} href={href({ cat: c })} className={chip(category === c)}>
                  {c}
                </Link>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-medium text-zinc-500">
              <Link href={href({ free: sp.free === "1" ? undefined : "1" })} className={sp.free === "1" ? "text-rose-600" : ""}>
                {sp.free === "1" ? "✓ " : ""}나눔만
              </Link>
              <Link href={href({ sold: sp.sold === "hide" ? undefined : "hide" })} className={sp.sold === "hide" ? "text-rose-600" : ""}>
                {sp.sold === "hide" ? "✓ " : ""}거래완료 숨기기
              </Link>
              {me && (
                <>
                  <Link href={href({ view: view === "mine" ? undefined : "mine" })} className={view === "mine" ? "text-rose-600" : ""}>
                    {view === "mine" ? "✓ " : ""}내 글
                  </Link>
                  <Link href={href({ view: view === "liked" ? undefined : "liked" })} className={view === "liked" ? "text-rose-600" : ""}>
                    {view === "liked" ? "✓ " : ""}관심 목록
                  </Link>
                </>
              )}
            </div>

            {items === null ? (
              <p className="mt-8 text-sm text-zinc-500">목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
            ) : items.length === 0 ? (
              <p className="mt-10 text-center text-sm text-zinc-500">
                {sp.q || category || sp.free || view ? "조건에 맞는 글이 없어요." : "아직 올라온 물건이 없어요. 첫 글을 올려 보세요!"}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">
                {items.map((it) => (
                  <li key={it.id}>
                    <Link href={`/market/${it.id}`} className="flex gap-4 py-4">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
                        {it.thumbId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/market/images/${it.thumbId}?size=thumb`} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-2xl" aria-hidden>
                            📦
                          </span>
                        )}
                        {it.status !== "selling" && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[13px] font-bold text-white">
                            {STATUSES[it.status]}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[15px] leading-snug">{it.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {it.area} · {it.bumped ? "끌올 " : ""}
                          {timeAgo(it.bumpedAt)}
                          {it.expired && <span className="ml-1 font-semibold text-rose-600">· 목록에서 빠짐</span>}
                        </p>
                        <p className={`mt-1 text-[15px] font-bold ${it.price === 0 ? "text-rose-600" : ""}`}>{formatPrice(it.price)}</p>
                        {it.likes > 0 && <p className="mt-1 text-right text-xs text-zinc-400">♡ {it.likes}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* 글쓰기: 화면 오른쪽 아래 고정 */}
            <Link
              href={me ? "/market/new" : "/api/auth/kakao?next=market"}
              className="fixed bottom-6 right-5 z-30 flex h-12 items-center gap-1.5 rounded-full bg-rose-600 px-5 text-[15px] font-bold text-white shadow-lg shadow-rose-600/30 sm:right-[max(20px,calc(50%-316px))]"
            >
              <span aria-hidden className="text-lg leading-none">＋</span> 글쓰기
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
