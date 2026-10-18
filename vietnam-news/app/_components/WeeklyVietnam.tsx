"use client";

import { useEffect, useRef, useState } from "react";
import type { PeriodId, Ranking, RankedStory, ScopeId } from "@/lib/rankings";
import type { FullAccess as Access } from "@/lib/access";
import { issueNumber, PERIOD_TABS, SECTIONS, SITE_NAME, weekTitle } from "@/lib/labels";

const POLL_MS = 8000;
const MAX_POLLS = 45; // 약 6분

type Purchase = { price: string; contact: string; kakaopayLink: string; kakaopayAmount: string; kakaopayQr: string };
type Totals = { runs: number; inputTokens: number; outputTokens: number; costUsd: number; priced: boolean };

// ── 데이터 ──────────────────────────────────
// 순위를 받아오고, 만드는 중이면 끝날 때까지 주기적으로 다시 묻는다
function useRanking(scope: ScopeId, period: PeriodId, initial: Ranking[]) {
  const [cache, setCache] = useState<Record<string, Ranking>>(() =>
    Object.fromEntries(initial.map((r) => [`${r.scope}:${r.period}`, r])),
  );
  const key = `${scope}:${period}`;
  const current = cache[key];

  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const res = await fetch(`/api/rankings?scope=${scope}&period=${period}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Ranking;
        setCache((c) => ({ ...c, [key]: data }));
        if (data.status === "pending" && ++polls < MAX_POLLS) timer = setTimeout(load, POLL_MS);
      } catch {
        if (!cancelled && ++polls < MAX_POLLS) timer = setTimeout(load, POLL_MS);
      }
    }

    if (!current || current.status === "pending" || current.status === "idle") load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // current는 일부러 뺀다: 탭이 바뀔 때만 새로 시작한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return current;
}

// ── 화면 ──────────────────────────────────
export default function WeeklyVietnam({
  access,
  initial,
  purchase,
  model,
  totals,
  currentWeek,
}: {
  access: Access;
  initial: Ranking[];
  currentWeek: string; // 지금 발행돼 있는 주간의 월요일 (순위가 아직 없어도 호수·날짜를 보여 주려고)
  purchase: Purchase;
  model: string;
  totals: Totals;
}) {
  const [period, setPeriod] = useState<PeriodId>("week");
  const [city, setCity] = useState<ScopeId>("nhatrang");
  const [paywall, setPaywall] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [section, setSection] = useState(0);
  const navRef = useRef<HTMLElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null); // 섹션 탭 바로 위의 고정 기준점 (탭은 sticky라 위치가 변한다)
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [arrowsVisible, setArrowsVisible] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // 처음 온 모바일 독자에게만 '옆으로 넘겨 보세요' 안내를 한 번 보여 준다
  useEffect(() => {
    try {
      // 저장된 설정을 처음 한 번 읽어 온다
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.matchMedia("(pointer: coarse)").matches && !localStorage.getItem("vn-swipe-hint")) setShowHint(true);
    } catch {}
  }, []);

  // 양옆 화살표는 섹션 영역이 화면 가운데까지 올라왔을 때만 보인다 (첫 화면을 가리지 않게)
  useEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      if (anchor) setArrowsVisible(anchor.getBoundingClientRect().top < window.innerHeight * 0.3);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // 섹션을 바꾸면 섹션 머리로 올려 준다 (이미 위에 있으면 그대로)
  function goTo(i: number) {
    const next = Math.max(0, Math.min(SECTIONS.length - 1, i));
    if (next === section) return;
    setEnterFrom(next > section ? "right" : "left");
    setSection(next);
    setShowHint(false);
    try {
      localStorage.setItem("vn-swipe-hint", "seen");
    } catch {}
    const anchor = anchorRef.current;
    if (!anchor) return;
    const top = anchor.getBoundingClientRect().top + window.scrollY - 56; // 상단 바 높이만큼 위로
    if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
  }

  // 좌우 스와이프: 손가락을 따라 화면이 움직이고, 충분히 밀면 다음 섹션으로 미끄러져 넘어간다
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [enterFrom, setEnterFrom] = useState<"left" | "right" | null>(null);
  const axis = useRef<"x" | "y" | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
    axis.current = null;
  }
  function onTouchMove(e: React.TouchEvent) {
    const start = touch.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!axis.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (axis.current !== "x") return;
    const blocked = (dx > 0 && section === 0) || (dx < 0 && section === SECTIONS.length - 1);
    setDragging(true);
    setDragX(blocked ? dx * 0.25 : dx); // 끝 섹션에서는 고무줄처럼 덜 움직인다
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    setDragging(false);
    setDragX(0);
    if (!start || axis.current !== "x") return;
    const dx = e.changedTouches[0].clientX - start.x;
    if (Math.abs(dx) < 70) return;
    goTo(dx < 0 ? section + 1 : section - 1);
  }

  useEffect(() => {
    // 운영자용: 주소 끝에 #usage 를 붙이면 AI 사용량을 보여준다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowUsage(window.location.hash === "#usage");
  }, []);

  // 송금 확인을 기다리는 동안 20초마다 승인됐는지 보고, 승인되면 새로고침해 유료 기능과 안내를 띄운다
  const [waiting, setWaiting] = useState(Boolean(access.member?.pending));
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/membership", { cache: "no-store" });
        const data = (await res.json()) as { pending?: boolean; premiumUntil?: number | null };
        if (!data.pending && data.premiumUntil && data.premiumUntil > Date.now()) window.location.reload();
        else if (!data.pending) setWaiting(false); // 거절된 경우
      } catch {}
    }, 20_000);
    return () => clearInterval(t);
  }, [waiting]);

  // 승인 후 처음 들어왔을 때 한 번만 '멤버십이 열렸어요'
  const [approvedNotice, setApprovedNotice] = useState(Boolean(access.member?.justApproved && access.premium));
  useEffect(() => {
    if (!access.member?.justApproved) return;
    fetch("/api/membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seen: true }) }).catch(() => {});
  }, [access.member?.justApproved]);

  // 카카오 로그인에서 돌아오면: 성공이면 신청 화면을 다시 열고, 실패면 안내를 띄운다
  const [loginNotice, setLoginNotice] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("login");
    if (!result) return;
    params.delete("login");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (result === "ok") setPaywall(true);
    else if (result !== "cancel") setLoginNotice("카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }, []);

  const national = useRanking("national", period, initial);
  const local = useRanking(city, period, initial);
  const expat = useRanking("expat", "week", initial);
  const specialty = useRanking("specialty", "week", initial);

  // 호수·날짜는 항상 주간인 교민생활 순위에서 가져온다 (주간 순위가 나중에 도착해도 갱신된다)
  const weekly = expat?.weekKey ? expat : initial.find((r) => r.scope === "national");
  const weekKey = weekly?.weekKey ?? currentWeek;
  const issue = issueNumber(weekKey);
  const week = weekTitle(weekKey);
  const periodTab = PERIOD_TABS.find((p) => p.id === period)!;

  function choosePeriod(id: PeriodId) {
    const tab = PERIOD_TABS.find((p) => p.id === id)!;
    if (tab.premium && !access.premium) {
      setPaywall(true);
      return;
    }
    setPeriod(id);
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* 상단 바 */}
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-[17px] font-extrabold tracking-tight">{SITE_NAME}</span>
            {/* 휴대폰 폭에서는 로그인 버튼 자리를 위해 숨긴다 (제목 옆 큰 배지는 그대로) */}
            <span className="max-sm:hidden">
              <AiBadge size="sm" />
            </span>
            {issue && <span className="text-xs font-medium text-zinc-400 max-sm:hidden">No.{issue}</span>}
          </div>
          <div className="flex items-center gap-2">
            {access.loginEnabled && <AccountButton member={access.member} />}
            <button
              onClick={() => setPaywall(true)}
              className={`h-8 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold ${
                access.premium
                  ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              }`}
            >
              PRO<span className="max-[389px]:hidden">{access.premium ? " 이용 중" : " 이용권"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-24">
        {approvedNotice && (
          <div
            role="status"
            className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-gradient-to-r from-rose-600 to-fuchsia-600 p-4 text-white shadow-lg shadow-rose-600/30"
          >
            <span aria-hidden className="text-2xl leading-none">🎉</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">멤버십이 열렸어요!</p>
              <p className="mt-0.5 break-keep text-[13px] leading-snug text-white/90">
                {access.expiresAt ? `${fmtShort(access.expiresAt)}까지 ` : ""}일간 · 월간 · 연간 순위와 11–30위를 모두 볼 수 있어요.
              </p>
            </div>
            <button onClick={() => setApprovedNotice(false)} aria-label="닫기" className="shrink-0 font-semibold text-white/80">
              ✕
            </button>
          </div>
        )}

        {loginNotice && (
          <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {loginNotice}
            <button onClick={() => setLoginNotice("")} aria-label="닫기" className="shrink-0 font-semibold">
              ✕
            </button>
          </div>
        )}

        {/* 이번 호 */}
        <section className="pt-12">
          <h1 className="text-[40px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[52px]">
            Weekly
            <br />
            {/* 좁은 화면에서 배지가 다음 줄로 넘어가도 왼쪽에 붙도록 flex-wrap */}
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span>
                Vietnam <span className="text-rose-600">Brief</span>
              </span>
              <AiBadge size="lg" />
            </span>
          </h1>
          <p className="mt-3 break-keep text-[15px] font-medium text-zinc-600 dark:text-zinc-400">
            AI가 화제성과 중요성을 기준으로 고른 이번 주 뉴스
          </p>
          <p className="mt-5 flex flex-wrap items-baseline gap-x-2 text-xl font-bold tracking-tight">
            {week ? week.title : "이번 주"}
            {week && <span className="text-base font-medium tabular-nums text-zinc-400">({week.range})</span>}
          </p>
          <p className="mt-1 text-[13px] text-zinc-500">매주 월요일 06:00 발행 · 4개 섹션 TOP 10</p>
        </section>

        {/* 기간 */}
        <div className="mt-7 grid grid-cols-5 gap-0.5 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist" aria-label="기간">
          {PERIOD_TABS.map((p) => {
            const locked = p.premium && !access.premium;
            const active = period === p.id;
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={active}
                onClick={() => choosePeriod(p.id)}
                className={`flex h-9 items-center justify-center gap-0.5 whitespace-nowrap rounded-full text-sm font-semibold transition ${
                  active
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {p.label}
                {locked && <LockIcon />}
              </button>
            );
          })}
        </div>


        {/* 섹션: 한 번에 하나씩, 양옆 화살표·탭·좌우 스와이프로 넘긴다 */}
        <div ref={anchorRef} className="mt-10" aria-hidden />
        <nav
          ref={navRef}
          className="sticky top-14 z-10 -mx-5 border-b border-zinc-200 bg-white/90 px-5 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90"
          aria-label="섹션"
        >
          <div className="flex items-center gap-4 whitespace-nowrap min-[380px]:gap-5 sm:gap-6" role="tablist">
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={section === i}
                onClick={() => goTo(i)}
                className={`relative py-3 text-sm font-semibold transition-colors ${
                  section === i ? "text-zinc-900 dark:text-white" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                {s.title}
                {section === i && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-rose-600" />}
              </button>
            ))}
            <span className="ml-auto font-mono text-xs tabular-nums text-zinc-400">
              {section + 1}/{SECTIONS.length}
            </span>
          </div>
        </nav>

        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          data-swipe
          className="touch-pan-y"
        >
          {showHint && (
            <p className="mt-4 flex items-center justify-center gap-2 text-[13px] font-medium text-zinc-400">
              <ArrowIcon dir="left" /> 옆으로 넘기면 다음 섹션 <ArrowIcon dir="right" />
            </p>
          )}
          <div
            key={section}
            style={{ transform: dragX ? `translateX(${dragX}px)` : undefined, opacity: dragX ? 1 - Math.min(Math.abs(dragX) / 600, 0.35) : undefined }}
            className={`${dragging ? "" : "transition-transform duration-200 ease-out"} ${
              enterFrom === "right" ? "animate-slide-from-right" : enterFrom === "left" ? "animate-slide-from-left" : ""
            }`}
          >
          {section === 0 && (
            <Section id="vietnam" title="베트남" desc={SECTIONS[0].desc} badge={periodTab.label}>
              <RankingView key={`national:${period}`} ranking={national} onPaywall={() => setPaywall(true)} />
            </Section>
          )}

          {section === 1 && (
            <Section
              id="local"
              title="나트랑 · 달랏"
              desc={SECTIONS[1].desc}
              badge={periodTab.label}
              right={
                <div className="flex rounded-full bg-zinc-100 p-0.5 dark:bg-zinc-900">
                  {SECTIONS[1].scopes.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCity(c.id)}
                      aria-pressed={city === c.id}
                      className={`h-8 rounded-full px-3.5 text-[13px] font-semibold ${
                        city === c.id ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-500"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              }
            >
              <RankingView key={`${city}:${period}`} ranking={local} onPaywall={() => setPaywall(true)} />
            </Section>
          )}

          {section === 2 && (
            <Section id="expat" title="교민생활" desc={SECTIONS[2].desc} badge="주간">
              <RankingView key="expat" ranking={expat} onPaywall={() => setPaywall(true)} />
            </Section>
          )}

          {section === 3 && (
            <Section id="specialty" title="나트랑 · 달랏 특산품" desc={SECTIONS[3].desc} badge="주간">
              <RankingView key="specialty" ranking={specialty} onPaywall={() => setPaywall(true)} />
            </Section>
          )}

          </div>

          {/* 아래쪽 넘김: 기간 탭과 같은 알약 모양 */}
          <Pager section={section} onGo={goTo} />
        </div>

        {/* 양옆 화살표 (화면 가운데 높이에 고정) */}
        {arrowsVisible && section > 0 && (
          <SideArrow dir="left" label={`이전: ${SECTIONS[section - 1].title}`} onClick={() => goTo(section - 1)} />
        )}
        {arrowsVisible && section < SECTIONS.length - 1 && (
          <SideArrow dir="right" label={`다음: ${SECTIONS[section + 1].title}`} onClick={() => goTo(section + 1)} />
        )}

        <footer className="mt-20 space-y-2 border-t border-zinc-200 pt-6 text-[13px] leading-relaxed text-zinc-500 dark:border-zinc-800">
          <p>
            순위와 요약은 AI가 영어·한국어·베트남어 기사 제목을 읽고 정리한 편집 판단입니다. 금액·날짜·시행 규정은 근거
            기사 원문에서 확인하세요.
          </p>
          <p>주간·교민생활·특산품은 매주 월요일 06:00(베트남 시간)에 지난주 월~일 기준으로 발행됩니다.</p>
          {access.loginEnabled && (
            <p>로그인은 카카오톡(카카오계정)으로 하며, 카카오 닉네임만 받습니다. 멤버십은 로그인한 카카오계정에 연결됩니다.</p>
          )}
          {showUsage && (
            <p className="font-mono text-xs">
              [운영자] {model} · 순위 {totals.runs}회 · 입력 {totals.inputTokens.toLocaleString()} · 출력{" "}
              {totals.outputTokens.toLocaleString()} 토큰{totals.priced && ` · $${totals.costUsd.toFixed(2)}`}
            </p>
          )}
        </footer>
      </main>

      {paywall && <Paywall access={access} purchase={purchase} onClose={() => setPaywall(false)} onSent={() => setWaiting(true)} />}
    </div>
  );
}

function Section({
  id,
  title,
  desc,
  badge,
  right,
  children,
}: {
  id: string;
  title: string;
  desc: string;
  badge: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="pt-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">{badge} Top 10</p>
          <h2 className="mt-1 text-[22px] font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-[13px] text-zinc-500">{desc}</p>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function RankingView({ ranking, onPaywall }: { ranking?: Ranking; onPaywall: () => void }) {
  const [showMore, setShowMore] = useState(false);

  if (ranking?.status === "locked") {
    return (
      <Locked
        title="PRO 전용 메뉴"
        body="주간은 무료예요. 일간부터 3년까지는 쌀국수 한 그릇 가격으로 열립니다."
        onPaywall={onPaywall}
      />
    );
  }
  if (ranking && !ranking.enabled) {
    return <Empty>순위를 준비 중입니다. (운영자: ANTHROPIC_API_KEY 설정 필요)</Empty>;
  }
  if (!ranking || ranking.status === "idle" || ranking.status === "pending") {
    return <Skeleton />;
  }
  if (ranking.stories.length === 0) {
    return <Empty>순위를 만들지 못했습니다. 잠시 후 다시 확인해 주세요.</Empty>;
  }

  const head = ranking.stories.slice(0, 10);
  const rest = ranking.stories.slice(10);
  const lockedCount = ranking.lockedCount ?? 0;

  return (
    <div>
      <ol className="space-y-3">
        {head.map((s) => (
          <StoryCard key={s.rank} story={s} />
        ))}
      </ol>

      {lockedCount > 0 && (
        <Locked
          title={`11–${10 + lockedCount}위`}
          body={`나머지 ${lockedCount}건은 쌀국수 한 그릇 가격이면 다 보여요.`}
          onPaywall={onPaywall}
          className="mt-3"
        />
      )}

      {rest.length > 0 && (
        <>
          {showMore && (
            <ol className="mt-3 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {rest.map((s) => (
                <CompactRow key={s.rank} story={s} />
              ))}
            </ol>
          )}
          <button
            onClick={() => setShowMore(!showMore)}
            aria-expanded={showMore}
            className="mt-3 h-11 w-full rounded-xl text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {showMore ? "접기" : `11–${10 + rest.length}위 보기`}
          </button>
        </>
      )}
    </div>
  );
}

function StoryCard({ story: s }: { story: RankedStory }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-center gap-2 text-xs">
        <span className={`font-mono text-[13px] font-bold tabular-nums ${s.rank <= 3 ? "text-rose-600" : "text-zinc-400"}`}>
          {String(s.rank).padStart(2, "0")}
        </span>
        <span className="text-zinc-300 dark:text-zinc-700">/</span>
        <span className="font-semibold text-zinc-500">{s.category}</span>
        {s.weeksAgo ? <PastBadge weeksAgo={s.weeksAgo} /> : null}
        {s.status && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            {s.status}
          </span>
        )}
      </div>

      <h3 className="mt-2.5 text-[17px] font-semibold leading-snug tracking-tight">{s.headline}</h3>

      {s.figures.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {s.figures.map((f) => (
            <div key={f.label + f.value}>
              <dt className="text-xs text-zinc-500">{f.label}</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums tracking-tight">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {s.summary && <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">{s.summary}</p>}

      {s.timeline.length > 0 && (
        <ol className="mt-4 space-y-2">
          {s.timeline.map((t, i) => (
            <li key={i} className="flex gap-3 text-[13px] leading-snug">
              <span className="w-[4.5rem] shrink-0 font-mono tabular-nums text-zinc-400">{fmtShort(t.date)}</span>
              <span className="text-zinc-700 dark:text-zinc-300">{t.event}</span>
            </li>
          ))}
        </ol>
      )}

      {s.talkingPoint && (
        <p className="mt-4 border-l-2 border-rose-500 pl-3 text-[14px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {s.talkingPoint}
        </p>
      )}

      {s.articles.length > 0 && (
        <>
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            근거 기사 {s.articles.length}
            <Chevron open={open} />
          </button>
          {open && <Sources story={s} />}
        </>
      )}
    </li>
  );
}

function CompactRow({ story: s }: { story: RankedStory }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 px-5 py-3.5 text-left">
        <span className="w-6 shrink-0 font-mono text-[13px] font-bold tabular-nums text-zinc-400">{s.rank}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
            {s.category}
            {s.weeksAgo ? <PastBadge weeksAgo={s.weeksAgo} /> : null}
          </span>
          <span className="block text-[15px] font-medium leading-snug">{s.headline}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="px-5 pb-4 pl-14">
          <Sources story={s} />
        </div>
      )}
    </li>
  );
}

// 이번 주 순위가 30위를 못 채워 지난 주 순위에서 가져온 항목 표시
// 상단 바 로그인·로그아웃: 비회원은 카카오 로그인 버튼, 회원은 닉네임 메뉴(로그아웃)
function AccountButton({ member }: { member: Access["member"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  if (!member) {
    return (
      <a
        href="/api/auth/kakao"
        className="flex h-8 items-center gap-1 whitespace-nowrap rounded-full bg-[#FEE500] px-3 text-[13px] font-semibold text-black/85"
        aria-label="카카오톡으로 로그인"
      >
        <KakaoIcon className="h-4 w-4" />
        카카오톡 로그인
      </a>
    );
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  const name = member.nickname || "카카오 회원";
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${name} 계정 메뉴`}
        className="flex h-8 max-w-[9.5rem] items-center gap-1 whitespace-nowrap rounded-full bg-[#FEE500] pl-2.5 pr-2 text-[13px] font-semibold text-black/85"
      >
        <KakaoIcon className="h-4 w-4 shrink-0" />
        {/* 닉네임이 없으면(동의 안 함) '내 계정' */}
        <span className="truncate">{member.nickname || "내 계정"}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-56 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}님</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
              <KakaoIcon className="h-3.5 w-3.5" />
              카카오톡으로 로그인됨
            </p>
          </div>
          {member.admin && (
            <a href="/admin" className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
              운영자 · 멤버십 승인
            </a>
          )}
          <button
            onClick={logout}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

// "by AI" 배지: 상단 바(sm)와 제목 옆(lg)에 같은 모양으로 쓴다
function AiBadge({ size }: { size: "sm" | "lg" }) {
  const sizing = size === "lg" ? "gap-1 px-3 py-1 text-[17px] shadow-md sm:px-3.5 sm:text-[22px]" : "gap-0.5 px-2 py-0.5 text-[11px] shadow-sm";
  return (
    <span
      className={`relative inline-flex items-center overflow-hidden whitespace-nowrap rounded-full bg-gradient-to-r from-rose-600 to-fuchsia-600 font-bold leading-none tracking-normal text-white shadow-rose-600/25 ${sizing}`}
    >
      <SparkleIcon />
      by AI
      {/* 은은하게 지나가는 빛 */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 animate-shine bg-gradient-to-r from-transparent via-white/35 to-transparent" />
    </span>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[0.9em] w-[0.9em]" fill="currentColor">
      <path d="M12 2l2.2 6.3L20.5 10.5 14.2 12.7 12 19l-2.2-6.3L3.5 10.5l6.3-2.2z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" opacity=".7" />
    </svg>
  );
}

function PastBadge({ weeksAgo }: { weeksAgo: number }) {
  return (
    <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      {weeksAgo === 1 ? "지난주" : `${weeksAgo}주 전`}
    </span>
  );
}

function Sources({ story }: { story: RankedStory }) {
  return (
    <ul className="mt-3 space-y-2.5">
      {story.articles.map((a) => (
        <li key={a.link} className="text-[13px] leading-snug">
          <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-800 dark:text-zinc-200 dark:decoration-zinc-600">
            {a.title}
          </a>
          <span className="mt-0.5 block text-xs text-zinc-400">
            {a.publisher} · {fmtShort(a.publishedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// 잠긴 순위: 실제 데이터는 서버가 보내지 않으므로 흐린 가짜 줄 위에 안내를 얹는다
function Locked({ title, body, onPaywall, className = "" }: { title: string; body: string; onPaywall: () => void; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 ${className}`}>
      <div aria-hidden className="space-y-4 p-5 blur-[3px]">
        {[0.9, 0.7, 0.8].map((w, i) => (
          <div key={i} className="space-y-2">
            <div className="h-2.5 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3.5 rounded bg-zinc-200 dark:bg-zinc-800" style={{ width: `${w * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 px-6 text-center dark:bg-zinc-950/70">
        <p className="flex items-center gap-1.5 text-[15px] font-bold">
          <LockIcon /> {title}
        </p>
        <p className="mt-1 text-[13px] text-zinc-500">{body}</p>
        <button onClick={onPaywall} className="mt-3 h-9 rounded-full bg-zinc-900 px-4 text-[13px] font-semibold text-white dark:bg-white dark:text-zinc-900">
          🍜 한 그릇 값으로 열기
        </button>
      </div>
    </div>
  );
}

function Skeleton() {
  // 이 화면에서 기다린 시간 (순위 생성이 시작된 시각은 서버가 따로 알려주지 않는다)
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-3" aria-busy="true">
      <div
        role="status"
        className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-500/25 dark:bg-rose-500/10"
      >
        <div className="flex items-center gap-4">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-2xl shadow-sm dark:bg-zinc-900">
            <span aria-hidden className="absolute -top-0.5 left-1/2 flex -translate-x-1/2 gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-2.5 w-0.5 animate-steam rounded-full bg-rose-300 opacity-0 dark:bg-rose-400"
                  style={{ animationDelay: `${i * 0.35}s` }}
                />
              ))}
            </span>
            <span aria-hidden className="mt-1">🍜</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-keep text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">뉴스를 모아 순위를 정리하고 있어요</p>
            <p className="mt-0.5 break-keep text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">
              보통 1~3분 걸려요. 끝나면 이 화면에 바로 나타나요.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-500/15" aria-hidden>
            <div className="h-full w-1/3 animate-indeterminate rounded-full bg-rose-500" />
          </div>
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-rose-600 dark:text-rose-400" aria-label={`기다린 시간 ${elapsed}`}>
            {elapsed}
          </span>
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse space-y-3 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="h-2.5 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-4/5 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-full rounded bg-zinc-100 dark:bg-zinc-900" />
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">{children}</div>;
}

// ── 멤버십 신청 (로그인한 회원) ─────────────────
// 카카오페이 송금 → "송금했어요" → 운영자가 /admin 에서 확인·승인하면 30일 열린다
function MembershipApply({
  member,
  premium,
  purchase,
  onSent,
}: {
  member: NonNullable<Access["member"]>;
  premium: boolean;
  purchase: Purchase;
  onSent: () => void;
}) {
  const [payer, setPayer] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">(member.pending ? "sent" : "idle");
  const [error, setError] = useState("");

  async function notifySent(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payerName: payer }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setState("sent");
        onSent();
      }
      else {
        setError(data.error ?? "보내지 못했습니다.");
        setState("idle");
      }
    } catch {
      setError("연결이 불안정합니다. 다시 시도해 주세요.");
      setState("idle");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <div className="mt-5">
      {state === "sent" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/25 dark:bg-rose-500/10">
          <p className="text-[15px] font-bold">송금 확인 중이에요</p>
          <p className="mt-1 break-keep text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            운영자가 카카오페이 입금을 확인하면 바로 열려요. 이 화면은 닫아도 괜찮아요.
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
          <p className="text-[13px] font-semibold text-zinc-500">{premium ? "30일 연장하기" : "신청하기"}</p>
          <ol className="mt-3 space-y-4 text-sm">
            <li>
              <p className="font-semibold">
                1. 카카오페이로 {purchase.kakaopayAmount || purchase.price || DEFAULT_PRICE} 보내기
              </p>
              {purchase.kakaopayLink ? (
                <>
                  {/* 휴대폰(터치)에서는 버튼, PC(마우스)에서는 휴대폰으로 찍을 QR */}
                  <a
                    href={purchase.kakaopayLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-2 h-11 w-full items-center justify-center rounded-xl bg-[#FEE500] text-sm font-semibold text-black/85 ${
                      purchase.kakaopayQr ? "flex pointer-fine:hidden" : "flex"
                    }`}
                  >
                    카카오페이 송금 열기
                  </a>
                  {purchase.kakaopayQr && (
                    <div className="mt-2 hidden items-center gap-4 pointer-fine:flex">
                      {/* 서버에서 만든 작은 SVG라 next/image 최적화가 필요 없다 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/svg+xml;utf8,${encodeURIComponent(purchase.kakaopayQr)}`}
                        alt="카카오페이 송금 QR 코드"
                        width={112}
                        height={112}
                        className="shrink-0 rounded-lg bg-white p-1"
                      />
                      <p className="break-keep text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                        휴대폰 카메라로 QR을 찍으면 카카오페이 송금 화면이 열려요.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-1 text-xs text-zinc-400">(운영자: KAKAOPAY_LINK 설정 필요)</p>
              )}
            </li>
            <li>
              <form onSubmit={notifySent}>
                <label htmlFor="payer-name" className="font-semibold">
                  2. 보낸 분 이름을 적고 알려 주세요
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="payer-name"
                    value={payer}
                    onChange={(e) => setPayer(e.target.value)}
                    autoComplete="name"
                    placeholder="카카오페이 송금자 이름"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3.5 text-[15px] outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-transparent dark:focus:border-zinc-300"
                  />
                  <button
                    type="submit"
                    disabled={state === "sending" || !payer.trim()}
                    className="h-11 shrink-0 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
                  >
                    송금했어요
                  </button>
                </div>
              </form>
            </li>
          </ol>
          {error && <p className="mt-2 text-[13px] font-medium text-rose-600">{error}</p>}
        </div>
      )}
      <p className="mt-3 text-center text-xs text-zinc-500">
        {member.nickname || "카카오 회원"}님으로 로그인됨 ·{" "}
        <button onClick={logout} className="font-medium underline underline-offset-2">
          로그아웃
        </button>
      </p>
    </div>
  );
}

function KakaoIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.82 1.87 5.3 4.69 6.7l-.95 3.48c-.08.3.26.54.52.37l4.14-2.74c.53.06 1.06.09 1.6.09 5.52 0 10-3.54 10-7.9S17.52 3 12 3z" />
    </svg>
  );
}

// ── 이용권 안내 · 코드 입력 ─────────────────────
// PREMIUM_PRICE_TEXT가 없을 때 보여 줄 가격
const DEFAULT_PRICE = "70,000동";

function Paywall({ access, purchase, onClose, onSent }: { access: Access; purchase: Purchase; onClose: () => void; onSent: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok) window.location.reload();
      else setError(data.error ?? "등록하지 못했습니다.");
    } catch {
      setError("연결이 불안정합니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function releaseCode() {
    await fetch("/api/unlock", { method: "DELETE" });
    window.location.reload();
  }

  const member = access.member;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 pb-8 dark:bg-zinc-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700 sm:hidden" />
        <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">{SITE_NAME} PRO</p>
        <h2 id="paywall-title" className="mt-1 whitespace-pre-line text-xl font-bold leading-snug tracking-tight">
          {access.premium ? "PRO 이용 중" : "멤버십 구독으로\n더 깊게, 더 자세히"}
        </h2>

        {access.premium ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {access.expiresAt ? `${fmtShort(access.expiresAt)}까지 이용할 수 있어요.` : "기간 제한 없이 이용 중이에요."}
          </p>
        ) : (
          <>
            <p className="mt-2 break-keep text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              주간 베스트뿐만 아니라 <b className="font-semibold text-zinc-900 dark:text-white">일간 · 월간 · 연간</b> 베스트 뉴스를 한눈에!
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
              {["3년 장기 순위까지", "모든 섹션 11–30위까지", "주간 TOP 10은 지금처럼 무료"].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <CheckIcon />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <span className="text-sm text-zinc-500">🍜 한 달, 쌀국수 한 그릇</span>
              <span className="text-lg font-bold tabular-nums">{purchase.price || DEFAULT_PRICE}</span>
            </div>

            <div className="mt-4 flex gap-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
              <span aria-hidden className="text-lg leading-none">🤖</span>
              <p className="break-keep text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">회비는 어디에 쓰이나요?</span>
                <br />
                매주 수백 건의 기사 제목을 읽고 고르는 AI 이용료와 서버비로 쓰여요. AI도 쌀국수 한 그릇은 먹어야 일하거든요.
              </p>
            </div>
          </>
        )}

        {/* 신청: 카카오 로그인 → 카카오페이 송금 → 운영자 승인 */}
        {access.loginEnabled ? (
          !member ? (
            <a
              href="/api/auth/kakao"
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-[15px] font-semibold text-black/85"
            >
              <KakaoIcon />
              카카오로 시작하기
            </a>
          ) : (
            <MembershipApply member={member} premium={access.premium} purchase={purchase} onSent={onSent} />
          )
        ) : (
          !access.premium && (
            <div className="mt-5 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
              <p className="text-xs font-semibold text-zinc-500">구매 문의</p>
              {purchase.contact ? (
                <p className="mt-1 select-all text-[15px] font-semibold">{purchase.contact}</p>
              ) : (
                <p className="mt-1 text-xs text-zinc-400">(운영자: PREMIUM_CONTACT 설정 필요)</p>
              )}
              <p className="mt-1 text-xs text-zinc-500">결제 확인 후 이용권 코드를 보내 드려요.</p>
            </div>
          )
        )}

        {/* 예전 방식: 운영자가 보내 준 이용권 코드 */}
        {access.byCode ? (
          <button onClick={releaseCode} className="mt-5 h-11 w-full rounded-xl border border-zinc-300 text-sm font-semibold dark:border-zinc-700">
            이 기기에서 이용권 코드 해제
          </button>
        ) : (
          !access.premium && (
            <details className="mt-5 group">
              <summary className="cursor-pointer list-none text-center text-[13px] font-medium text-zinc-500 underline-offset-2 hover:underline">
                이용권 코드가 있나요?
              </summary>
              <form onSubmit={submit} className="mt-3">
                <div className="flex gap-2">
                  <input
                    id="premium-code"
                    aria-label="이용권 코드"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="코드 입력"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-transparent px-3.5 text-[15px] uppercase outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-300"
                  />
                  <button
                    type="submit"
                    disabled={busy || !code.trim()}
                    className="h-11 shrink-0 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
                  >
                    {busy ? "확인 중" : "등록"}
                  </button>
                </div>
                {error && <p className="mt-2 text-[13px] font-medium text-rose-600">{error}</p>}
              </form>
            </details>
          )
        )}

        <button onClick={onClose} className="mt-4 h-10 w-full text-sm font-medium text-zinc-500">
          닫기
        </button>
      </div>
    </div>
  );
}

function Pager({ section, onGo }: { section: number; onGo: (i: number) => void }) {
  const prev = section > 0 ? SECTIONS[section - 1] : null;
  const next = section < SECTIONS.length - 1 ? SECTIONS[section + 1] : null;
  const circle =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-30";
  return (
    <nav aria-label="섹션 넘기기" className="mt-10 flex items-center gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
      <button
        onClick={() => onGo(section - 1)}
        disabled={!prev}
        aria-label={prev ? `이전: ${prev.title}` : "이전 없음"}
        className={`${circle} text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800`}
      >
        <ArrowIcon dir="left" />
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
        <div className="flex gap-1.5" aria-hidden>
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              tabIndex={-1}
              onClick={() => onGo(i)}
              className={`h-1.5 rounded-full transition-all ${i === section ? "w-5 bg-rose-600" : "w-1.5 bg-zinc-300 dark:bg-zinc-700"}`}
            />
          ))}
        </div>
        <span className="truncate text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">
          {next ? `다음 · ${next.title}` : "마지막 섹션"}
        </span>
      </div>

      <button
        onClick={() => onGo(section + 1)}
        disabled={!next}
        aria-label={next ? `다음: ${next.title}` : "다음 없음"}
        className={`${circle} bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white`}
      >
        <ArrowIcon dir="right" />
      </button>
    </nav>
  );
}

function SideArrow({ dir, label, onClick }: { dir: "left" | "right"; label: string; onClick: () => void }) {
  // 넓은 화면 전용 (본문 672px 바깥). 모바일은 스와이프와 아래 넘김 버튼을 쓴다
  const pos =
    dir === "left"
      ? "left-[max(4px,calc(50%-336px-60px))]"
      : "right-[max(4px,calc(50%-336px-60px))]";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`fixed top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full sm:flex border border-zinc-200 bg-white/80 text-zinc-700 shadow-md backdrop-blur-md transition hover:bg-white active:scale-95 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-900 ${pos}`}
    >
      <ArrowIcon dir={dir} />
    </button>
  );
}

// ── 아이콘 ─────────────────────────────────
function ArrowIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      {dir === "left" ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden className="shrink-0 opacity-70">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function fmtShort(t: number) {
  const d = new Date(t);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
