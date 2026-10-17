"use client";

import { useEffect, useState } from "react";
import type { PeriodId, Ranking, RankedStory, ScopeId } from "@/lib/rankings";
import { LOCAL_TABS, PERIOD_TABS } from "@/lib/labels";

const POLL_MS = 8000;
const MAX_POLLS = 45; // 약 6분

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

    // 이미 받아 둔 완성본이 있으면 다시 묻지 않는다
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

export default function Top10App({
  initialNational,
  initialLocal,
  initialExpat,
  model,
  totals,
}: {
  initialNational: Ranking;
  initialLocal: Ranking;
  initialExpat: Ranking;
  model: string;
  totals: { runs: number; inputTokens: number; outputTokens: number; costUsd: number; since: number; priced: boolean };
}) {
  const [period, setPeriod] = useState<PeriodId>("week");
  const [city, setCity] = useState<ScopeId>("nhatrang");
  const national = useRanking("national", period, [initialNational]);
  const local = useRanking(city, period, [initialLocal]);
  const expat = useRanking("expat", "week", [initialExpat]);
  const periodLabel = PERIOD_TABS.find((p) => p.id === period)!.label;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Vietnam News</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">베트남 뉴스 TOP 10</h1>
        <p className="mt-2 text-sm text-gray-500">
          국제정세·국내정책·한국 관련 소식을 중심으로, 여러 언론의 기사 제목을 AI가 읽고 고른 핵심 뉴스입니다.
        </p>
      </header>

      <nav
        className="sticky top-0 z-10 -mx-4 mb-6 bg-stone-50/95 px-4 py-2 backdrop-blur"
        aria-label="기간 선택"
      >
        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm">
          {PERIOD_TABS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                period === p.id ? "bg-red-700 text-white" : "text-gray-600 hover:bg-stone-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </nav>

      <RankingView key={`national:${period}`} ranking={national} title={`${periodLabel} 베트남 TOP 10`} />

      <section className="mt-12">
        <h2 className="text-xl font-bold">교민·관광업 생활정보</h2>
        <p className="mb-3 mt-1 text-sm text-gray-500">
          외국인 정책(비자·체류·취업허가·가이드 자격), 환율·송금, 부동산, 사업·세금, 관광업 규정, 외국인 관련 사건사고.
          나트랑 소식 우선 · 주간 전용 (기간 탭과 상관없이 지난주 기준)
        </p>
        <RankingView key="expat" ranking={expat} title="이번 주 교민·관광업 생활정보" compact />
      </section>

      <section className="mt-12">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-xl font-bold">나트랑 · 달랏 TOP 10</h2>
          <div className="flex gap-1 rounded-lg bg-white p-1 shadow-sm">
            {LOCAL_TABS.map((c) => (
              <button
                key={c.id}
                onClick={() => setCity(c.id)}
                aria-pressed={city === c.id}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  city === c.id ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-stone-100"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <RankingView
          key={`${city}:${period}`}
          ranking={local}
          title={`${periodLabel} ${LOCAL_TABS.find((c) => c.id === city)!.label} TOP 10`}
          compact
        />
      </section>

      <footer className="mt-12 space-y-1 border-t border-stone-200 pt-4 text-xs text-gray-400">
        <p>
          순위와 요약은 AI({model})가 Google News에 실린 영어·한국어·베트남어 기사 제목만 보고 만든 편집 판단입니다.
          객관적인 순위가 아니며, 숫자나 세부 내용은 근거 기사 원문에서 확인하세요.
        </p>
        <p>
          일주일 순위와 교민·관광업 생활정보는 매주 월요일 오전 6시(베트남 시간)에 지난주 월~일 뉴스로 자동 갱신됩니다. 나머지 탭은 처음 열 때
          만들어지고 오늘 6시간 · 한 달 2일 · 3개월 7일 · 1년 14일마다 갱신됩니다.
        </p>
        {totals.runs > 0 && (
          <p>
            서버 시작 후 AI 사용량: 순위 {totals.runs}회 생성 · 입력 {totals.inputTokens.toLocaleString()} · 출력{" "}
            {totals.outputTokens.toLocaleString()} 토큰
            {totals.priced && ` · 약 $${totals.costUsd.toFixed(2)}`}
          </p>
        )}
      </footer>
    </main>
  );
}

function RankingView({ ranking, title, compact }: { ranking?: Ranking; title: string; compact?: boolean }) {
  const [showMore, setShowMore] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  if (ranking && !ranking.enabled) {
    return (
      <Box>
        <p className="text-sm text-gray-500">ANTHROPIC_API_KEY 환경변수를 설정하면 순위가 표시됩니다.</p>
      </Box>
    );
  }
  if (!ranking || ranking.status === "idle" || ranking.status === "pending") {
    return (
      <Box>
        <p className="animate-pulse text-sm text-gray-500">
          {title}을 만들고 있습니다. 기사를 모으고 순위를 매기는 데 1~3분 걸립니다.
        </p>
      </Box>
    );
  }
  if (ranking.stories.length === 0) {
    return (
      <Box>
        <p className="text-sm text-gray-500">순위를 만들지 못했습니다: {ranking.error ?? "알 수 없는 오류"}</p>
      </Box>
    );
  }

  const head = ranking.stories.slice(0, 10);
  const rest = ranking.stories.slice(10);
  const toggle = (rank: number) => setOpen(open === rank ? null : rank);

  return (
    <div>
      <p className="mb-2 text-xs text-gray-400">
        {ranking.rangeLabel && <span className="font-medium text-gray-600">{ranking.rangeLabel} · 매주 월요일 아침 자동 갱신 · </span>}
        기사 제목 {ranking.poolSize}개 분석
        {ranking.generatedAt && ` · ${new Date(ranking.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Ho_Chi_Minh", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} (베트남 시간) 기준`}
        {ranking.usage &&
          ` · 생성에 토큰 ${(ranking.usage.inputTokens + ranking.usage.outputTokens).toLocaleString()}개` +
            (ranking.usage.costUsd != null ? ` (약 $${ranking.usage.costUsd.toFixed(3)})` : "")}
        {ranking.error && ` · 최근 갱신 실패로 이전 결과 표시 중`}
      </p>

      <ol className="space-y-3">
        {head.map((s) => (
          <li key={s.rank} className="rounded-xl bg-white shadow-sm">
            <button
              onClick={() => toggle(s.rank)}
              aria-expanded={open === s.rank}
              className="flex w-full gap-4 p-4 text-left"
            >
              <span
                className={`w-8 shrink-0 text-right font-mono font-bold tabular-nums ${
                  compact ? "text-xl text-gray-400" : "text-2xl text-red-700"
                }`}
              >
                {s.rank}
              </span>
              <span className="min-w-0 flex-1">
                <Meta story={s} />
                <span className="mt-1 block text-base font-semibold leading-snug">{s.headline}</span>
                <Figures story={s} />
                {s.summary && <span className="mt-1.5 block text-sm leading-relaxed text-gray-600">{s.summary}</span>}
                <Timeline story={s} />
                {s.talkingPoint && (
                  <span className="mt-2 block rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                    💬 {s.talkingPoint}
                  </span>
                )}
                {s.articles.length > 0 && (
                  <span className="mt-2 block text-xs text-gray-400">
                    근거 기사 {s.articles.length}건 {open === s.rank ? "▲" : "▼"}
                  </span>
                )}
              </span>
            </button>
            {open === s.rank && <Sources story={s} />}
          </li>
        ))}
      </ol>

      {rest.length > 0 && (
        <>
          {showMore && (
            <ol className="mt-3 divide-y divide-stone-100 rounded-xl bg-white shadow-sm">
              {rest.map((s) => (
                <li key={s.rank}>
                  <button
                    onClick={() => toggle(s.rank)}
                    aria-expanded={open === s.rank}
                    className="flex w-full items-baseline gap-4 px-4 py-3 text-left"
                  >
                    <span className="w-8 shrink-0 text-right font-mono text-sm font-bold tabular-nums text-gray-400">
                      {s.rank}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Meta story={s} />
                      <span className="mt-0.5 block text-sm font-medium">{s.headline}</span>
                      {open === s.rank && s.summary && (
                        <span className="mt-1 block text-sm text-gray-600">{s.summary}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">{open === s.rank ? "▲" : "▼"}</span>
                  </button>
                  {open === s.rank && <Sources story={s} />}
                </li>
              ))}
            </ol>
          )}
          <button
            onClick={() => setShowMore(!showMore)}
            aria-expanded={showMore}
            className="mt-3 w-full rounded-xl border border-stone-200 bg-white py-3 text-sm font-medium text-gray-600 hover:bg-stone-100"
          >
            {showMore ? "접기 ▲" : `더 보기 · 11~${10 + rest.length}위 ▼`}
          </button>
        </>
      )}
    </div>
  );
}

function Meta({ story }: { story: RankedStory }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-gray-600">{story.category}</span>
      {story.status && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">● {story.status}</span>
      )}
      {story.period && <span className="font-mono text-gray-400">{story.period}</span>}
    </span>
  );
}

// 핵심 수치: 근거 기사 제목에 있는 숫자만 서버에서 걸러져 온다
function Figures({ story }: { story: RankedStory }) {
  if (!story.figures?.length) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-2">
      {story.figures.map((f) => (
        <span key={f.label + f.value} className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1">
          <span className="block text-[11px] leading-tight text-gray-500">{f.label}</span>
          <span className="block font-mono text-sm font-bold tabular-nums text-gray-900">{f.value}</span>
        </span>
      ))}
    </span>
  );
}

// 진행 경과: 날짜는 연결된 기사의 발행일
function Timeline({ story }: { story: RankedStory }) {
  if (!story.timeline?.length) return null;
  return (
    <span className="mt-2 block border-l-2 border-stone-200 pl-3">
      {story.timeline.map((t, i) => (
        <span key={i} className="block text-xs leading-relaxed text-gray-600">
          <span className="mr-2 font-mono text-gray-400">{fmtDay(t.date)}</span>
          {t.event}
        </span>
      ))}
    </span>
  );
}

function fmtDay(t: number) {
  const d = new Date(t);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function Sources({ story }: { story: RankedStory }) {
  if (story.articles.length === 0) return null;
  return (
    <ul className="space-y-1.5 border-t border-stone-100 px-4 py-3 pl-16">
      {story.articles.map((a) => (
        <li key={a.link} className="text-xs leading-snug">
          <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
            {a.title}
          </a>
          <span className="ml-1 text-gray-400">
            {a.publisher} · {new Date(a.publishedAt).toLocaleDateString("ko-KR")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-white p-6 shadow-sm">{children}</div>;
}
