import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccess } from "@/lib/access";
import { BUMP_INTERVAL_HOURS, contactLink, getItem, MAX_BUMPS, STATUSES } from "@/lib/market";
import SiteTabs from "../../_components/SiteTabs";
import MarketHeader from "../MarketHeader";
import { formatPrice, timeAgo } from "../format";
import ItemActions from "./ItemActions";

export const dynamic = "force-dynamic";

// /market/:id — 판매 글 자세히
export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const access = await getAccess();
  if (!Number.isInteger(id) || !access.loginEnabled) notFound();
  const me = access.member;
  const item = await getItem(id, me?.id ?? null).catch(() => null);
  const isOwner = Boolean(me && item && me.id === item.sellerId);
  // 신고로 숨겨진 글은 작성자와 운영자에게만
  if (!item || (item.hidden && !isOwner && !me?.admin)) notFound();
  const link = contactLink(item.contact);

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <MarketHeader nickname={me?.nickname ?? ""} loggedIn={Boolean(me)} loginEnabled />
      <SiteTabs active="market" />

      <main className="mx-auto max-w-2xl pb-24">
        {/* 사진: 옆으로 넘겨 보기 */}
        {item.imageIds.length > 0 ? (
          <div className="flex snap-x snap-mandatory overflow-x-auto bg-zinc-100 dark:bg-zinc-900">
            {item.imageIds.map((imgId, i) => (
              <div key={imgId} className="relative w-full shrink-0 snap-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/market/images/${imgId}`} alt={`${item.title} 사진 ${i + 1}`} className="mx-auto max-h-[70vh] w-full object-contain" />
                {item.imageIds.length > 1 && (
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">
                    {i + 1} / {item.imageIds.length}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center bg-zinc-100 text-4xl dark:bg-zinc-900" aria-hidden>
            📦
          </div>
        )}

        <div className="px-5">
          <div className="flex items-center gap-2 border-b border-zinc-100 py-4 text-sm dark:border-zinc-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FEE500] font-bold text-black/80">
              {(item.sellerNickname || "회")[0]}
            </span>
            <div>
              <p className="font-semibold">{item.sellerNickname || "카카오 회원"}</p>
              <p className="text-xs text-zinc-500">{item.area}</p>
            </div>
          </div>

          {item.hidden && (
            <p className="mt-4 rounded-xl bg-rose-50 p-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              신고가 쌓여 다른 회원에게 보이지 않는 글이에요. 운영자가 확인 중이에요.
            </p>
          )}

          <div className="py-5">
            {item.status !== "selling" && (
              <span className="mr-2 rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-bold text-white dark:bg-white dark:text-zinc-900">
                {STATUSES[item.status]}
              </span>
            )}
            <h1 className="mt-2 text-xl font-bold leading-snug tracking-tight">{item.title}</h1>
            <p className="mt-1 text-xs text-zinc-500">
              {item.category} · {item.bumped ? `끌올 ${timeAgo(item.bumpedAt)}` : timeAgo(item.createdAt)}
              {item.likes > 0 && ` · 관심 ${item.likes}`}
            </p>
            <p className={`mt-3 text-2xl font-extrabold tracking-tight ${item.price === 0 ? "text-rose-600" : ""}`}>{formatPrice(item.price)}</p>
            {item.description && <p className="mt-5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{item.description}</p>}
          </div>

          {/* 연락: 로그인 회원에게만 보인다 */}
          <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-[13px] font-semibold text-zinc-500">판매자에게 연락하기</p>
            {me ? (
              link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex h-11 items-center justify-center rounded-xl bg-[#FEE500] text-sm font-semibold text-black/85"
                >
                  카카오톡 오픈채팅으로 연락하기
                </a>
              ) : (
                <p className="mt-2 text-[15px]">
                  카카오톡 ID <b className="select-all font-mono">{item.contact}</b>
                  <span className="mt-1 block text-xs text-zinc-500">카카오톡 → 친구 추가 → ID로 추가에서 찾을 수 있어요.</span>
                </p>
              )
            ) : (
              <a
                href="/api/auth/kakao?next=market"
                className="mt-2 flex h-11 items-center justify-center rounded-xl bg-[#FEE500] text-sm font-semibold text-black/85"
              >
                카카오톡 로그인하고 연락처 보기
              </a>
            )}
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">직접 만나 물건을 확인하고 거래하세요. 선입금이나 계좌번호부터 요구하면 조심하세요.</p>
          </section>

          <ItemActions
            id={item.id}
            loggedIn={Boolean(me)}
            liked={item.likedByMe}
            canManage={isOwner || Boolean(me?.admin)}
            isOwner={isOwner}
            status={item.status}
            bump={{
              nextAt: item.bumpedAt + BUMP_INTERVAL_HOURS * 3600_000,
              left: MAX_BUMPS - item.bumpCount,
              expired: item.expired,
            }}
          />

          <Link href="/market" className="mt-8 block text-center text-sm font-medium text-zinc-500">
            ← 목록으로
          </Link>
        </div>
      </main>
    </div>
  );
}
