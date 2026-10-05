"use client";

import { useMemo, useState } from "react";
import type { Article, NewsBundle } from "@/lib/news";
import { REGION_LABEL, type Region } from "@/lib/sources";
import { TOPICS, type TopicId } from "@/lib/topics";

type RegionFilter = "all" | Region;
type RangeFilter = 24 | 72 | 168;

const LANG_BADGE: Record<Article["lang"], string> = { ko: "KO", en: "EN", vi: "VI" };
const REGION_COLOR: Record<Region, string> = {
  vn: "bg-red-100 text-red-800",
  intl: "bg-blue-100 text-blue-800",
  kr: "bg-emerald-100 text-emerald-800",
};
const TOPIC_LABEL = Object.fromEntries(TOPICS.map((t) => [t.id, t.label])) as Record<TopicId, string>;

export default function NewsBoard({ initial }: { initial: NewsBundle }) {
  const [bundle, setBundle] = useState(initial);
  const [region, setRegion] = useState<RegionFilter>("all");
  const [koreaOnly, setKoreaOnly] = useState(false);
  const [topic, setTopic] = useState<TopicId | null>(null);
  const [range, setRange] = useState<RangeFilter>(72);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const now = bundle.fetchedAt;

  const inRange = useMemo(
    () => bundle.articles.filter((a) => now - a.publishedAt <= range * 3600_000),
    [bundle, now, range],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange.filter(
      (a) =>
        (region === "all" || a.region === region) &&
        (!koreaOnly || a.korea) &&
        (!topic || a.topics.includes(topic)) &&
        (!q || a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q)),
    );
  }, [inRange, region, koreaOnly, topic, query]);

  const last24 = useMemo(() => bundle.articles.filter((a) => now - a.publishedAt <= 24 * 3600_000), [bundle, now]);
  const topicCounts = useMemo(
    () =>
      TOPICS.map((t) => ({ ...t, count: last24.filter((a) => a.topics.includes(t.id)).length })).sort(
        (a, b) => b.count - a.count,
      ),
    [last24],
  );
  const koreaHighlights = useMemo(() => inRange.filter((a) => a.korea).slice(0, 6), [inRange]);
  const regionCounts = useMemo(() => {
    const c: Record<Region, number> = { vn: 0, intl: 0, kr: 0 };
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

      {failed.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {failed.length}개 피드를 불러오지 못했습니다: {failed.map((s) => s.name).join(", ")}
        </div>
      )}

      {/* 한눈에 보기 */}
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-500">최근 24시간 주제별 기사 수</h2>
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
            언론별: 베트남 {regionCounts.vn} · 해외 {regionCounts.intl} · 한국 {regionCounts.kr} (선택 기간)
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
                    {a.title}
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
          {(["all", "vn", "intl", "kr"] as RegionFilter[]).map((r) => (
            <Chip key={r} active={region === r} onClick={() => setRegion(r)}>
              {r === "all" ? "전체" : REGION_LABEL[r]}
            </Chip>
          ))}
          <span className="mx-1 w-px bg-gray-300" />
          <Chip active={koreaOnly} onClick={() => setKoreaOnly(!koreaOnly)}>
            🇰🇷 한국 관련만
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
          <span className="text-sm text-gray-500">{filtered.length}건</span>
        </div>
      </section>

      {/* 기사 목록 */}
      <ul className="space-y-2">
        {filtered.map((a) => (
          <li key={a.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`rounded px-1.5 py-0.5 font-medium ${REGION_COLOR[a.region]}`}>
                {REGION_LABEL[a.region]}
              </span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600">{LANG_BADGE[a.lang]}</span>
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
              {a.title}
            </a>
            {a.summary && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{a.summary}</p>}
            <p className="mt-1 text-xs text-gray-400">
              {a.publisher} · {relTime(a.publishedAt, now)}
            </p>
          </li>
        ))}
        {filtered.length === 0 && <li className="py-10 text-center text-gray-400">조건에 맞는 기사가 없습니다.</li>}
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
          </ul>
        )}
        <p className="mt-2">
          주제·한국 관련 분류는 제목/요약의 키워드 매칭 결과이므로 오분류가 있을 수 있습니다. 기사 내용은 원문에서
          확인하세요.
        </p>
      </footer>
    </main>
  );
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
