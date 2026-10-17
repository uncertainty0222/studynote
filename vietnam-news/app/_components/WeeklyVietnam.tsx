"use client";

import { useEffect, useState } from "react";
import type { PeriodId, Ranking, RankedStory, ScopeId } from "@/lib/rankings";
import type { Access } from "@/lib/premium";
import { issueNumber, PERIOD_TABS, SECTIONS, SITE_NAME } from "@/lib/labels";

const POLL_MS = 8000;
const MAX_POLLS = 45; // 약 6분

type Purchase = { price: string; contact: string };
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

// 글자 크기: 보통 18px / 크게 21px (이 기기에만 기억)
function useFontSize() {
  const [large, setLarge] = useState(false);
  useEffect(() => {
    try {
      // 저장된 설정을 처음 한 번 읽어 온다
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("vn-font") === "large") setLarge(true);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.style.fontSize = large ? "21px" : "18px";
    try {
      localStorage.setItem("vn-font", large ? "large" : "normal");
    } catch {}
  }, [large]);
  return [large, setLarge] as const;
}

// ── 화면 ──────────────────────────────────
export default function WeeklyVietnam({
  access,
  initial,
  purchase,
  model,
  totals,
}: {
  access: Access;
  initial: Ranking[];
  purchase: Purchase;
  model: string;
  totals: Totals;
}) {
  const [period, setPeriod] = useState<PeriodId>("week");
  const [city, setCity] = useState<ScopeId>("nhatrang");
  const [paywall, setPaywall] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [large, setLarge] = useFontSize();

  useEffect(() => {
    // 운영자용: 주소 끝에 #usage 를 붙이면 AI 사용량을 보여준다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowUsage(window.location.hash === "#usage");
  }, []);

  const national = useRanking("national", period, initial);
  const local = useRanking(city, period, initial);
  const expat = useRanking("expat", "week", initial);

  // 호수·날짜는 항상 주간인 교민정보 순위에서 가져온다 (주간 순위가 나중에 도착해도 갱신된다)
  const weekly = expat?.weekKey ? expat : initial.find((r) => r.scope === "national");
  const issue = issueNumber(weekly?.weekKey);
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
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* 머리말 */}
      <header className="border-b-4 border-red-700 bg-white">
        <div className="mx-auto max-w-3xl px-4 pb-5 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[2.2rem] font-black leading-none tracking-tight text-red-700">{SITE_NAME}</h1>
              <p className="mt-2 text-base text-stone-700">나트랑 교민을 위한 한 주 베트남 뉴스</p>
            </div>
            <button
              onClick={() => setLarge(!large)}
              className="min-h-12 rounded-xl border-2 border-stone-300 px-4 text-base font-bold text-stone-800"
              aria-pressed={large}
            >
              {large ? "글자 보통" : "글자 크게"}
            </button>
          </div>
          <p className="mt-4 text-lg font-bold text-stone-900">
            {issue ? `제${issue}호 · ` : ""}
            {weekly?.rangeLabel ?? "이번 주"}
          </p>
          <p className="text-base text-stone-600">매주 월요일 아침 6시(베트남 시간) 발행</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20">
        {/* 이용권 상태 */}
        <div className="mt-4">
          {access.premium ? (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-base text-emerald-900">
              <b>이용권 사용 중</b>
              {access.expiresAt ? ` · ${fmtDate(access.expiresAt)}까지` : ""} · 모든 기간과 11~30위를 볼 수 있습니다.
            </div>
          ) : (
            <button
              onClick={() => setPaywall(true)}
              className="flex min-h-12 w-full items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-left text-base text-amber-900"
            >
              <span>
                <b>이용권</b>이 있으면 일간·월간·1년·3년 순위와 11~30위까지 볼 수 있어요
              </span>
              <span className="shrink-0 font-bold underline">안내 보기</span>
            </button>
          )}
        </div>

        {/* 기간 */}
        <nav aria-label="기간" className="mt-5">
          <div className="grid grid-cols-5 gap-1.5 rounded-2xl bg-white p-1.5 shadow-sm">
            {PERIOD_TABS.map((p) => {
              const locked = p.premium && !access.premium;
              const active = period === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => choosePeriod(p.id)}
                  aria-pressed={active}
                  className={`min-h-14 rounded-xl text-base font-bold ${
                    active ? "bg-red-700 text-white" : "text-stone-800 hover:bg-stone-100"
                  }`}
                >
                  {p.label}
                  {locked && <span className="block text-xs font-medium text-stone-500">🔒 유료</span>}
                </button>
              );
            })}
          </div>
        </nav>

        {/* 섹션 바로가기 */}
        <nav aria-label="섹션" className="sticky top-0 z-10 -mx-4 mt-3 bg-stone-50/95 px-4 py-2 backdrop-blur">
          <div className="flex gap-2 overflow-x-auto">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex min-h-12 shrink-0 items-center rounded-full border-2 border-stone-300 bg-white px-5 text-base font-bold text-stone-800"
              >
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        {/* 한눈에 보기: 각 섹션 1~3위 */}
        {period === "week" && <Glance rankings={[national, local, expat]} cityLabel={city === "dalat" ? "달랏" : "나트랑"} />}

        {/* 베트남 */}
        <Section id="vietnam" title="베트남" desc={SECTIONS[0].desc} badge={periodTab.label}>
          <RankingView key={`national:${period}`} ranking={national} onPaywall={() => setPaywall(true)} />
        </Section>

        {/* 나트랑·달랏 */}
        <Section
          id="local"
          title="나트랑 · 달랏"
          desc={SECTIONS[1].desc}
          badge={periodTab.label}
          right={
            <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm">
              {SECTIONS[1].scopes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCity(c.id)}
                  aria-pressed={city === c.id}
                  className={`min-h-12 rounded-lg px-5 text-base font-bold ${
                    city === c.id ? "bg-stone-900 text-white" : "text-stone-700"
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

        {/* 교민정보 */}
        <Section id="expat" title="교민정보" desc={SECTIONS[2].desc} badge="주간">
          <RankingView key="expat" ranking={expat} onPaywall={() => setPaywall(true)} />
        </Section>

        <footer className="mt-16 space-y-2 border-t-2 border-stone-200 pt-5 text-base leading-relaxed text-stone-600">
          <p>
            순위와 요약은 AI가 영어·한국어·베트남어 기사 제목을 읽고 정리한 것입니다. 중요한 내용(금액, 날짜, 시행 규정)은
            &lsquo;근거 기사&rsquo;의 원문에서 꼭 확인하세요.
          </p>
          <p>주간·교민정보는 매주 월요일 아침 6시(베트남 시간)에 지난주 월~일 뉴스로 새로 나옵니다.</p>
          {showUsage && (
            <p className="text-sm text-stone-500">
              [운영자] 모델 {model} · 서버 시작 후 순위 {totals.runs}회 생성 · 입력 {totals.inputTokens.toLocaleString()} ·
              출력 {totals.outputTokens.toLocaleString()} 토큰{totals.priced && ` · 약 $${totals.costUsd.toFixed(2)}`}
            </p>
          )}
        </footer>
      </main>

      {paywall && <Paywall access={access} purchase={purchase} onClose={() => setPaywall(false)} />}
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
    <section id={id} className="mt-12 scroll-mt-20">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-stone-900 pb-3">
        <div>
          <h2 className="text-[1.6rem] font-black leading-tight">
            {title} <span className="align-middle text-base font-bold text-red-700">{badge} TOP 10</span>
          </h2>
          <p className="mt-1 text-base text-stone-600">{desc}</p>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

// 이번 주 한눈에: 섹션별 1~3위 제목만
function Glance({ rankings, cityLabel }: { rankings: (Ranking | undefined)[]; cityLabel: string }) {
  const titles = ["베트남", cityLabel, "교민정보"];
  const rows = rankings.map((r, i) => ({ title: titles[i], stories: r?.stories.slice(0, 3) ?? [] }));
  if (rows.every((r) => r.stories.length === 0)) return null;
  return (
    <section className="mt-6 rounded-2xl bg-stone-900 p-5 text-white">
      <h2 className="text-xl font-black">이번 주 한눈에</h2>
      <div className="mt-3 space-y-4">
        {rows.map((r) =>
          r.stories.length ? (
            <div key={r.title}>
              <p className="text-sm font-bold text-amber-300">{r.title}</p>
              <ol className="mt-1 space-y-1">
                {r.stories.map((s) => (
                  <li key={s.rank} className="flex gap-2 text-base leading-snug">
                    <span className="w-5 shrink-0 font-bold text-amber-300">{s.rank}</span>
                    <span>{s.headline}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

function RankingView({ ranking, onPaywall }: { ranking?: Ranking; onPaywall: () => void }) {
  const [showMore, setShowMore] = useState(false);

  if (ranking?.status === "locked") {
    return (
      <Notice>
        <p className="text-lg font-bold">🔒 이용권 전용 순위입니다</p>
        <p className="mt-1 text-base text-stone-700">주간 순위는 무료로, 다른 기간은 이용권으로 볼 수 있어요.</p>
        <button onClick={onPaywall} className="mt-4 min-h-12 rounded-xl bg-red-700 px-6 text-base font-bold text-white">
          이용권 안내 보기
        </button>
      </Notice>
    );
  }
  if (ranking && !ranking.enabled) {
    return <Notice>순위를 준비 중입니다. (운영자: ANTHROPIC_API_KEY 설정 필요)</Notice>;
  }
  if (!ranking || ranking.status === "idle" || ranking.status === "pending") {
    return (
      <Notice>
        <p className="animate-pulse text-base text-stone-700">
          뉴스를 모아 순위를 정리하고 있습니다. 1~3분 뒤 다시 확인해 주세요.
        </p>
      </Notice>
    );
  }
  if (ranking.stories.length === 0) {
    return <Notice>이번에는 순위를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.</Notice>;
  }

  const head = ranking.stories.slice(0, 10);
  const rest = ranking.stories.slice(10);
  const lockedCount = ranking.lockedCount ?? 0;

  return (
    <div>
      <ol className="space-y-5">
        {head.map((s) => (
          <StoryCard key={s.rank} story={s} />
        ))}
      </ol>

      {lockedCount > 0 && (
        <div className="mt-5 rounded-2xl border-2 border-dashed border-stone-300 bg-white p-6 text-center">
          <p className="text-lg font-bold">11위 ~ {10 + lockedCount}위 더 보기</p>
          <p className="mt-1 text-base text-stone-600">이번 순위에 {lockedCount}건이 더 있습니다. 이용권으로 볼 수 있어요.</p>
          <button onClick={onPaywall} className="mt-4 min-h-12 rounded-xl bg-red-700 px-6 text-base font-bold text-white">
            🔒 이용권 안내 보기
          </button>
        </div>
      )}

      {rest.length > 0 && (
        <>
          {showMore && (
            <ol className="mt-5 divide-y-2 divide-stone-100 rounded-2xl bg-white shadow-sm">
              {rest.map((s) => (
                <CompactRow key={s.rank} story={s} />
              ))}
            </ol>
          )}
          <button
            onClick={() => setShowMore(!showMore)}
            aria-expanded={showMore}
            className="mt-5 min-h-14 w-full rounded-2xl border-2 border-stone-300 bg-white text-lg font-bold text-stone-800"
          >
            {showMore ? "접기 ▲" : `11위 ~ ${10 + rest.length}위 보기 ▼`}
          </button>
        </>
      )}
    </div>
  );
}

const CATEGORY_COLOR: Record<string, string> = {
  국제정세: "bg-blue-100 text-blue-900",
  국내정책: "bg-violet-100 text-violet-900",
  경제: "bg-emerald-100 text-emerald-900",
  "한국 관련": "bg-red-100 text-red-900",
  관광: "bg-sky-100 text-sky-900",
  사회: "bg-stone-200 text-stone-800",
  문화: "bg-pink-100 text-pink-900",
  "날씨·재해": "bg-orange-100 text-orange-900",
  "비자·체류": "bg-blue-100 text-blue-900",
  "금융·환율": "bg-emerald-100 text-emerald-900",
  부동산: "bg-amber-100 text-amber-900",
  "사업·세금": "bg-violet-100 text-violet-900",
  "관광업 규정": "bg-sky-100 text-sky-900",
  사건사고: "bg-orange-100 text-orange-900",
  "나트랑 생활": "bg-teal-100 text-teal-900",
};

function StoryCard({ story: s }: { story: RankedStory }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-black tabular-nums ${
            s.rank <= 3 ? "bg-red-700 text-white" : "bg-stone-200 text-stone-800"
          }`}
        >
          {s.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-lg px-2.5 py-1 text-sm font-bold ${CATEGORY_COLOR[s.category] ?? "bg-stone-200 text-stone-800"}`}>
              {s.category}
            </span>
            {s.status && (
              <span className="rounded-lg border-2 border-amber-400 px-2.5 py-0.5 text-sm font-bold text-amber-900">
                {s.status}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-[1.25rem] font-bold leading-snug">{s.headline}</h3>
        </div>
      </div>

      {s.figures.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {s.figures.map((f) => (
            <div key={f.label + f.value} className="rounded-xl bg-stone-100 px-4 py-3">
              <p className="text-sm font-medium text-stone-600">{f.label}</p>
              <p className="text-[1.5rem] font-black leading-tight tabular-nums">{f.value}</p>
            </div>
          ))}
        </div>
      )}

      {s.summary && <p className="mt-4 text-base leading-relaxed text-stone-800">{s.summary}</p>}

      {s.timeline.length > 0 && (
        <ol className="mt-4 space-y-2 border-l-4 border-stone-200 pl-4">
          {s.timeline.map((t, i) => (
            <li key={i} className="text-base leading-snug text-stone-800">
              <span className="mr-2 font-bold tabular-nums text-stone-500">{fmtDate(t.date)}</span>
              {t.event}
            </li>
          ))}
        </ol>
      )}

      {s.talkingPoint && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-base leading-relaxed text-amber-950">
          <b>💡 우리에게 의미</b>
          <br />
          {s.talkingPoint}
        </p>
      )}

      {s.articles.length > 0 && (
        <>
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="mt-4 min-h-12 w-full rounded-xl border-2 border-stone-200 text-base font-bold text-stone-700"
          >
            근거 기사 {s.articles.length}건 {open ? "접기 ▲" : "보기 ▼"}
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
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-14 w-full items-start gap-3 px-5 py-4 text-left">
        <span className="w-8 shrink-0 text-lg font-black tabular-nums text-stone-500">{s.rank}</span>
        <span className="min-w-0 flex-1">
          <span className={`mr-2 rounded-md px-2 py-0.5 text-sm font-bold ${CATEGORY_COLOR[s.category] ?? "bg-stone-200 text-stone-800"}`}>
            {s.category}
          </span>
          <span className="text-base font-bold leading-snug">{s.headline}</span>
        </span>
        <span className="shrink-0 text-base text-stone-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-4">
          <Sources story={s} />
        </div>
      )}
    </li>
  );
}

function Sources({ story }: { story: RankedStory }) {
  return (
    <ul className="mt-3 space-y-3">
      {story.articles.map((a) => (
        <li key={a.link} className="text-base leading-snug">
          <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-blue-800 underline underline-offset-2">
            {a.title}
          </a>
          <span className="block text-sm text-stone-600">
            {a.publisher} · {fmtDate(a.publishedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white p-6 text-base text-stone-700 shadow-sm">{children}</div>;
}

// ── 이용권 안내 · 코드 입력 ─────────────────────
function Paywall({ access, purchase, onClose }: { access: Access; purchase: Purchase; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function logout() {
    await fetch("/api/unlock", { method: "DELETE" });
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="paywall-title" className="text-2xl font-black">
          {SITE_NAME} 이용권
        </h2>

        {access.premium ? (
          <>
            <p className="mt-3 text-base text-stone-700">
              이 기기에서 이용권을 사용 중입니다{access.expiresAt ? ` (${fmtDate(access.expiresAt)}까지)` : ""}.
            </p>
            <button onClick={logout} className="mt-5 min-h-12 w-full rounded-xl border-2 border-stone-300 text-base font-bold">
              이 기기에서 이용권 해제
            </button>
          </>
        ) : (
          <>
            <ul className="mt-4 space-y-2 text-base text-stone-800">
              <li>✔ 일간 · 월간 · 1년 · 3년 순위</li>
              <li>✔ 모든 섹션 11위 ~ 30위</li>
              <li>✔ 주간 1~10위는 지금처럼 무료</li>
            </ul>
            {purchase.price && <p className="mt-4 text-xl font-black text-red-700">{purchase.price}</p>}

            <div className="mt-5 rounded-xl bg-stone-100 p-4">
              <p className="text-base font-bold">구매 방법</p>
              <p className="mt-1 text-base text-stone-700">아래 연락처로 문의하시면 결제 후 이용권 코드를 보내 드립니다.</p>
              {purchase.contact ? (
                <p className="mt-2 select-all text-lg font-bold">{purchase.contact}</p>
              ) : (
                <p className="mt-2 text-sm text-stone-500">(운영자: PREMIUM_CONTACT 설정 필요)</p>
              )}
            </div>

            <form onSubmit={submit} className="mt-5">
              <label htmlFor="premium-code" className="text-base font-bold">
                이용권 코드 입력
              </label>
              <input
                id="premium-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="예: NHATRANG2026"
                className="mt-2 min-h-14 w-full rounded-xl border-2 border-stone-300 px-4 text-lg uppercase"
              />
              {error && <p className="mt-2 text-base font-bold text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="mt-3 min-h-14 w-full rounded-xl bg-red-700 text-lg font-bold text-white disabled:opacity-50"
              >
                {busy ? "확인 중…" : "이용권 등록"}
              </button>
            </form>
          </>
        )}

        <button onClick={onClose} className="mt-3 min-h-12 w-full rounded-xl text-base font-bold text-stone-600">
          닫기
        </button>
      </div>
    </div>
  );
}

function fmtDate(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
