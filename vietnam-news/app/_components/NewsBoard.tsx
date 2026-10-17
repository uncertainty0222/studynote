"use client";

import { useMemo, useState } from "react";
import type { Article, NewsBundle } from "@/lib/news";
import { REGION_LABEL, type Region } from "@/lib/sources";
import { MONEY_TOPICS, TALK_TOPICS, TOPICS, type TopicId } from "@/lib/topics";

type RegionFilter = "all" | Region;
type RangeFilter = 24 | 72 | 168;
type View = "news" | "money";

function isMoney(a: Article) {
  return a.section === "money" || a.topics.some((t) => MONEY_TOPICS.includes(t));
}

const LANG_BADGE: Record<Article["lang"], string> = { ko: "KO", en: "EN", vi: "VI" };
const REGION_COLOR: Record<Region, string> = {
  vn: "bg-red-100 text-red-800",
  intl: "bg-blue-100 text-blue-800",
  kr: "bg-emerald-100 text-emerald-800",
  buzz: "bg-pink-100 text-pink-800",
};

// 가이드가 손님에게 꺼낼 만한 이야깃거리: 문화·관광·사회 주제, 한국 관련, 또는 SNS 화제
function isTalk(a: Article) {
  return a.korea || a.region === "buzz" || a.topics.some((t) => TALK_TOPICS.includes(t));
}
const TOPIC_LABEL = Object.fromEntries(TOPICS.map((t) => [t.id, t.label])) as Record<TopicId, string>;

export default function NewsBoard({ initial }: { initial: NewsBundle }) {
  const [bundle, setBundle] = useState(initial);
  const [view, setView] = useState<View>("news");
  const [region, setRegion] = useState<RegionFilter>("all");
  const [koreaOnly, setKoreaOnly] = useState(false);
  const [talkOnly, setTalkOnly] = useState(false);
  const [picksOnly, setPicksOnly] = useState(true);
  const [topic, setTopic] = useState<TopicId | null>(null);
  const [range, setRange] = useState<RangeFilter>(72);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showAllFb, setShowAllFb] = useState(false);

  const now = bundle.fetchedAt;

  // 뉴스 탭: 금융 전용 소스 기사를 뺀 전체 / 돈 이야기 탭: 금융·코인·부동산 기사만
  const viewArticles = useMemo(
    () => bundle.articles.filter((a) => (view === "money" ? isMoney(a) : !a.section)),
    [bundle, view],
  );
  const viewTopics = useMemo(
    () => TOPICS.filter((t) => (view === "money" ? MONEY_TOPICS.includes(t.id) : !MONEY_TOPICS.includes(t.id))),
    [view],
  );

  const inRange = useMemo(
    () => viewArticles.filter((a) => now - a.publishedAt <= range * 3600_000),
    [viewArticles, now, range],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange.filter(
      (a) =>
        (region === "all" || a.region === region) &&
        (!koreaOnly || a.korea) &&
        (!talkOnly || isTalk(a)) &&
        (!topic || a.topics.includes(topic)) &&
        (!q || `${a.title} ${a.titleKo ?? ""} ${a.summary}`.toLowerCase().includes(q)),
    );
  }, [inRange, region, koreaOnly, talkOnly, topic, query]);

  // 흥미도 상위 1/3만 남긴다 (동점이면 최신 기사 우선). 표시 순서는 최신순 그대로
  const shown = useMemo(() => {
    if (!picksOnly) return filtered;
    const keep = Math.ceil(filtered.length / 3);
    const picked = new Set(
      [...filtered]
        .sort((a, b) => b.interest - a.interest || b.publishedAt - a.publishedAt)
        .slice(0, keep)
        .map((a) => a.id),
    );
    return filtered.filter((a) => picked.has(a.id));
  }, [filtered, picksOnly]);
  const aiScored = useMemo(() => filtered.some((a) => a.interestByAi), [filtered]);

  const last24 = useMemo(() => viewArticles.filter((a) => now - a.publishedAt <= 24 * 3600_000), [viewArticles, now]);
  const topicCounts = useMemo(
    () =>
      viewTopics
        .map((t) => ({ ...t, count: last24.filter((a) => a.topics.includes(t.id)).length }))
        .sort((a, b) => b.count - a.count),
    [last24, viewTopics],
  );
  const koreaHighlights = useMemo(() => inRange.filter((a) => a.korea).slice(0, 6), [inRange]);
  const trends = useMemo(() => bundle.trends.slice(0, 15), [bundle]);
  const regionCounts = useMemo(() => {
    const c: Record<Region, number> = { vn: 0, intl: 0, kr: 0, buzz: 0 };
    for (const a of inRange) c[a.region]++;
    return c;
  }, [inRange]);
  const failed = bundle.sources.filter((s) => !s.ok);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/news?refresh=1", { cache: "no-store" });
      if (res.ok) setBundle(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🇻🇳 베트남 뉴스 브리핑</h1>
          <p className="mt-1 text-sm text-gray-500">
            베트남·해외·한국 언론 {bundle.sources.length}개 피드 · 마지막 수집 {formatTime(bundle.fetchedAt)}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </header>

      <nav className="mb-4 flex gap-2" aria-label="보기 선택">
        {(
          [
            ["news", "📰 베트남 뉴스"],
            ["money", "💰 금융·코인·부동산"],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => {
              setView(v);
              setTopic(null);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              view === v ? "bg-gray-900 text-white" : "bg-white text-gray-700 shadow-sm hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {failed.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {failed.length}개 피드를 불러오지 못했습니다: {failed.map((s) => s.name).join(", ")}
        </div>
      )}

      {view === "news" && <Top10Section top10={bundle.top10} now={now} />}

      {/* 실시간 검색어 */}
      {view === "news" && (
      <section className="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-500">🔥 지금 베트남에서 많이 찾는 검색어 (Google Trends)</h2>
        {trends.length === 0 ? (
          <p className="text-sm text-gray-400">검색어를 불러오지 못했습니다.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {trends.map((t) => (
              <li key={t.term}>
                <a
                  href={t.newsUrl ?? `https://www.google.com/search?q=${encodeURIComponent(t.term)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t.newsTitle}
                  className="inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-sm text-pink-900 hover:bg-pink-100"
                >
                  {t.term}
                  {t.traffic && <span className="font-mono text-xs text-pink-600">{t.traffic}</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {/* 페이스북 화제 게시글 */}
      {view === "news" && (
        <FacebookSection
          fb={bundle.facebook}
          now={now}
          showAll={showAllFb}
          onToggle={() => setShowAllFb(!showAllFb)}
        />
      )}

      {/* 한눈에 보기 */}
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-500">
            최근 24시간 {view === "money" ? "분야별" : "주제별"} 기사 수
          </h2>
          <ul className="space-y-1.5">
            {topicCounts.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setTopic(topic === t.id ? null : t.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1 text-sm hover:bg-gray-100 ${
                    topic === t.id ? "bg-gray-900 text-white hover:bg-gray-800" : ""
                  }`}
                >
                  <span>{t.label}</span>
                  <span className="font-mono">{t.count}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            언론별: 베트남 {regionCounts.vn} · 해외 {regionCounts.intl} · 한국 {regionCounts.kr} · 화제{" "}
            {regionCounts.buzz} (선택 기간)
          </p>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-500">🇰🇷 한국 관련 최신 기사</h2>
          {koreaHighlights.length === 0 ? (
            <p className="text-sm text-gray-400">선택 기간에 한국 관련 기사가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {koreaHighlights.map((a) => (
                <li key={a.id} className="text-sm">
                  <a href={a.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {a.titleKo ?? a.title}
                  </a>
                  <span className="ml-2 text-xs text-gray-400">
                    {a.publisher} · {relTime(a.publishedAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 필터 */}
      <section className="sticky top-0 z-10 mb-4 space-y-3 bg-gray-50/95 py-2 backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {(["all", "vn", "intl", "kr", "buzz"] as RegionFilter[]).map((r) => (
            <Chip key={r} active={region === r} onClick={() => setRegion(r)}>
              {r === "all" ? "전체" : REGION_LABEL[r]}
            </Chip>
          ))}
          <span className="mx-1 w-px bg-gray-300" />
          <Chip active={koreaOnly} onClick={() => setKoreaOnly(!koreaOnly)}>
            🇰🇷 한국 관련만
          </Chip>
          <Chip active={talkOnly} onClick={() => setTalkOnly(!talkOnly)}>
            💬 이야깃거리
          </Chip>
          <Chip active={picksOnly} onClick={() => setPicksOnly(!picksOnly)}>
            ⭐ 흥미 상위 1/3
          </Chip>
          <span className="mx-1 w-px bg-gray-300" />
          {([24, 72, 168] as RangeFilter[]).map((h) => (
            <Chip key={h} active={range === h} onClick={() => setRange(h)}>
              {h === 24 ? "24시간" : h === 72 ? "3일" : "7일"}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색 (예: 다낭, Samsung, bão)"
            className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
          />
          {topic && (
            <Chip active onClick={() => setTopic(null)}>
              {TOPIC_LABEL[topic]} ✕
            </Chip>
          )}
          <span className="text-sm text-gray-500">
            {picksOnly ? `${shown.length}건 (전체 ${filtered.length}건 중 흥미도 상위)` : `${filtered.length}건`}
            {picksOnly && !aiScored && " · AI 점수 준비 전이라 키워드 기준"}
          </span>
        </div>
      </section>

      {/* 기사 목록 */}
      <ul className="space-y-2">
        {shown.map((a) => (
          <li key={a.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`rounded px-1.5 py-0.5 font-medium ${REGION_COLOR[a.region]}`}>
                {REGION_LABEL[a.region]}
              </span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600">{LANG_BADGE[a.lang]}</span>
              {a.interestByAi && a.interest >= 8 && (
                <span className="rounded bg-orange-100 px-1.5 py-0.5 font-medium text-orange-800">🔥 흥미 {a.interest}</span>
              )}
              {a.korea && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-800">한국 관련</span>}
              {a.topics.map((t) => (
                <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                  {TOPIC_LABEL[t]}
                </span>
              ))}
            </div>
            <a
              href={a.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-medium leading-snug hover:underline"
            >
              {a.titleKo ?? a.title}
            </a>
            {a.titleKo && <p className="mt-0.5 text-xs text-gray-400">{a.title}</p>}
            {a.summary && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{a.summary}</p>}
            <p className="mt-1 text-xs text-gray-400">
              {a.publisher} · {relTime(a.publishedAt, now)}
            </p>
          </li>
        ))}
        {shown.length === 0 && <li className="py-10 text-center text-gray-400">조건에 맞는 기사가 없습니다.</li>}
      </ul>

      <footer className="mt-8 text-xs text-gray-400">
        <button onClick={() => setShowSources(!showSources)} className="underline">
          수집 피드 상태 {showSources ? "숨기기" : "보기"}
        </button>
        {showSources && (
          <ul className="mt-2 space-y-1">
            {bundle.sources.map((s) => (
              <li key={s.id}>
                {s.ok ? "✅" : "❌"} [{REGION_LABEL[s.region]}] {s.name} — {s.ok ? `${s.count}건` : s.error}
              </li>
            ))}
            <li>
              {!bundle.translation.enabled
                ? "⚪ 제목 번역 꺼짐 (ANTHROPIC_API_KEY 없음)"
                : bundle.translation.error
                  ? `❌ 제목 번역 — ${bundle.translation.error}`
                  : `✅ 제목 번역 (${bundle.translation.model}) — ${bundle.translation.cached}건 번역됨`}
            </li>
          </ul>
        )}
        <p className="mt-2">
          주제·한국 관련 분류는 제목/요약의 키워드 매칭 결과이므로 오분류가 있을 수 있습니다. 한국어 제목은 AI
          번역이며, 원문 제목은 그 아래 작은 글씨로 표시됩니다. 기사 내용은 원문에서 확인하세요.
        </p>
      </footer>
    </main>
  );
}

function Top10Section({ top10, now }: { top10: NewsBundle["top10"]; now: number }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="mb-4 rounded-xl border-2 border-red-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold">🏆 최근 30일 베트남 뉴스 TOP 10</h2>
      <p className="mb-3 text-xs text-gray-400">
        AI가 보도량과 파급력을 기준으로 고른 목록입니다 (편집 판단이며 객관적 순위가 아님)
        {top10.generatedAt && ` · ${top10.poolSize}개 제목 분석 · ${relTime(top10.generatedAt, now)} 생성`}
      </p>
      {!top10.enabled ? (
        <p className="text-sm text-gray-400">ANTHROPIC_API_KEY 환경변수를 설정하면 여기에 TOP 10이 표시됩니다.</p>
      ) : top10.stories.length === 0 ? (
        <p className="text-sm text-gray-400">
          {top10.error ? `생성 실패: ${top10.error}` : "TOP 10을 만들고 있습니다. 1~2분 뒤 새로고침하세요."}
        </p>
      ) : (
        <ol className="space-y-2">
          {top10.stories.map((s) => (
            <li key={s.rank} className="rounded-lg border border-gray-100 p-3">
              <button
                onClick={() => setOpen(open === s.rank ? null : s.rank)}
                className="flex w-full items-start gap-3 text-left"
                aria-expanded={open === s.rank}
              >
                <span className="w-6 shrink-0 font-mono text-lg font-bold text-red-700">{s.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{s.category}</span>
                  <span className="font-semibold">{s.headline}</span>
                  <span className="mt-1 block text-sm text-gray-600">{s.summary}</span>
                  <span className="mt-1 block text-sm text-red-800">💬 {s.talkingPoint}</span>
                </span>
                <span className="shrink-0 text-xs text-gray-400">관련 {s.articles.length}건</span>
              </button>
              {open === s.rank && s.articles.length > 0 && (
                <ul className="mt-2 ml-9 space-y-1 border-t border-gray-100 pt-2">
                  {s.articles.map((a) => (
                    <li key={a.link} className="text-xs">
                      <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                        {a.title}
                      </a>
                      <span className="ml-1 text-gray-400">
                        {a.publisher} · {new Date(a.publishedAt).toLocaleDateString("ko-KR")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {top10.error && top10.stories.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">최근 갱신 실패로 이전 결과를 보여주고 있습니다: {top10.error}</p>
      )}
    </section>
  );
}

function FacebookSection({
  fb,
  now,
  showAll,
  onToggle,
}: {
  fb: NewsBundle["facebook"];
  now: number;
  showAll: boolean;
  onToggle: () => void;
}) {
  const { posts, status } = fb;
  const shown = showAll ? posts : posts.slice(0, 6);
  return (
    <section className="mb-4 rounded-xl bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-gray-500">💬 페이스북 인기 페이지 화제 게시글</h2>
      <p className="mb-3 text-xs text-gray-400">
        반응·댓글·공유가 많은 순 · {status.pages.length}개 페이지
        {status.fetchedAt && ` · 수집 ${relTime(status.fetchedAt, now)}`}
      </p>
      {!status.enabled ? (
        <p className="text-sm text-gray-400">
          APIFY_TOKEN 환경변수를 설정하면 여기에 페이스북 게시글이 표시됩니다.
        </p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-400">
          {status.error
            ? `수집 실패: ${status.error}`
            : "게시글을 수집하고 있습니다. 처음에는 몇 분 걸리니 잠시 후 새로고침하세요."}
        </p>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map((p) => (
              <li key={p.id} className="min-w-0 rounded-lg border border-gray-200 p-3">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="truncate font-medium text-blue-700">{p.page}</span>
                  <span className="shrink-0">{relTime(p.publishedAt, now)}</span>
                </div>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="block hover:underline">
                  <p className="line-clamp-4 text-sm whitespace-pre-line">{p.text}</p>
                </a>
                <p className="mt-2 font-mono text-xs text-gray-500">
                  👍 {fmtCount(p.reactions)} · 💬 {fmtCount(p.comments)} · ↗ {fmtCount(p.shares)}
                </p>
              </li>
            ))}
          </ul>
          {posts.length > 6 && (
            <button onClick={onToggle} className="mt-3 text-sm text-gray-500 underline">
              {showAll ? "접기" : `${posts.length - 6}개 더 보기`}
            </button>
          )}
        </>
      )}
      {status.enabled && status.error && posts.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">최근 수집 실패로 이전 결과를 보여주고 있습니다: {status.error}</p>
      )}
    </section>
  );
}

function fmtCount(n: number) {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm ${
        active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

function relTime(t: number, now: number) {
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

function formatTime(t: number) {
  return new Date(t).toLocaleString("ko-KR", {
    timeZone: "Asia/Ho_Chi_Minh",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " (베트남 시간)";
}
