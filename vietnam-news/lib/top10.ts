// 최근 2년 베트남 핵심 뉴스: 국제정세와 국내정책에서 큰 변화를 만든 사건을 Claude가 골라 순위를 매긴다.
// ANTHROPIC_API_KEY가 없으면 아무것도 하지 않는다.
//
// - 재료: Google News를 분기별(after:/before:)로 쪼개 검색한 기사 제목. RSS는 검색당 약 100건이 한계라
//   2년을 한 번에 검색하면 최근 기사만 나오므로 8개 분기 × 주제별 검색으로 나눈다.
// - 같은 사건을 다룬 기사를 한 건으로 묶고, 근거 기사 링크와 시기를 함께 보여준다.
// - 2년치 목록이라 자주 바뀌지 않으므로 기본 3일에 한 번(TOP10_REFRESH_HOURS) 갱신한다. 백그라운드에서 돈다.
// - 요약은 제목만 보고 쓰므로 세부 수치는 원문 링크로 확인해야 한다.

import Anthropic from "@anthropic-ai/sdk";
import type { Article } from "./news";
import { fetchSource } from "./news";
import { googleNews, VIETNAM_RE, type Source } from "./sources";

export type TopStory = {
  rank: number;
  headline: string;
  summary: string;
  talkingPoint: string;
  category: string;
  period: string; // 근거 기사 날짜 범위 (예: "2025.04" 또는 "2025.04~2025.06")
  articles: { title: string; link: string; publisher: string; publishedAt: number }[];
};

export type Top10 = {
  enabled: boolean;
  generatedAt: number | null;
  stories: TopStory[];
  poolSize: number;
  error?: string;
};

const MODEL = process.env.TOP10_MODEL || "claude-opus-5-5";
const REFRESH_MS = Number(process.env.TOP10_REFRESH_HOURS ?? 72) * 3600_000;
const RETRY_AFTER_FAILURE_MS = 30 * 60 * 1000;
const MAX_STORIES = 30;
const PER_QUERY = 40; // 검색 하나에서 쓸 기사 수 (Google 관련도 순 상위)
const QUARTERS = 8;

// 분기마다 돌릴 검색: 국제정세, 국내정책, 한국 언론
const QUERIES: { lang: "en" | "ko"; q: string }[] = [
  {
    lang: "en",
    q: 'Vietnam (China OR "United States" OR Trump OR tariff OR ASEAN OR "South China Sea" OR Russia OR Japan OR EU OR "trade deal")',
  },
  {
    lang: "en",
    q: 'Vietnam (reform OR law OR decree OR resolution OR "National Assembly" OR Politburo OR "party chief" OR merger OR policy)',
  },
  { lang: "ko", q: "베트남 (정책 OR 개혁 OR 법 OR 관세 OR 미국 OR 중국 OR 정상회담 OR 총리 OR 서기장)" },
];

const SYSTEM = `You are an editor briefing a Korean tour guide who works in Vietnam and must not miss the big picture. From the numbered headlines (last two years, oldest and newest mixed), rank the ${MAX_STORIES} most significant Vietnam stories. Rank first the stories that changed things:
(a) international affairs: shifts in Vietnam's relations with the US, China, Russia, Japan, the EU, Korea and ASEAN; tariffs and trade deals; the South China Sea; Vietnam's place in global supply chains;
(b) domestic policy: leadership changes, institutional and administrative reforms (ministry or province mergers), major new laws and resolutions, big shifts in economic, investment, visa or tourism policy.
Then consider large economic, social or disaster events with national impact. Prefer stories covered by many outlets and across several months. Skip celebrity news, local crime and stories not about Vietnam.

Rules:
- Merge headlines about the same event or the same ongoing development into one story and list all their ids.
- Write in Korean. headline: one concise line. summary: 2-3 sentences on what happened and why it matters. talking_point: one natural sentence the guide could say to Korean tourists.
- Use only facts present in the headlines. Do not invent numbers, dates or quotes. If a detail is unclear, leave it out.
- category: one of 국제정세, 국내정책, 경제, 한국 관련, 관광, 사회, 날씨·재해.
- Order by significance, most important first.`;

const SCHEMA = {
  type: "object",
  properties: {
    stories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          headline: { type: "string" },
          summary: { type: "string" },
          talking_point: { type: "string" },
          category: { type: "string" },
          ids: { type: "array", items: { type: "integer" } },
        },
        required: ["headline", "summary", "talking_point", "category", "ids"],
        additionalProperties: false,
      },
    },
  },
  required: ["stories"],
  additionalProperties: false,
};

let state: Top10 = { enabled: false, generatedAt: null, stories: [], poolSize: 0 };
let running: Promise<void> | null = null;
let lastFailureAt = 0;

export function getTop10(current: Article[]): Top10 {
  const enabled = Boolean(process.env.ANTHROPIC_API_KEY);
  state = { ...state, enabled };
  if (!enabled) return state;

  const stale = !state.generatedAt || Date.now() - state.generatedAt > REFRESH_MS;
  const cooling = Date.now() - lastFailureAt < RETRY_AFTER_FAILURE_MS;
  if (stale && !running && !cooling) {
    running = generate(current).finally(() => {
      running = null;
    });
  }
  return state;
}

// 오늘부터 거꾸로 3개월씩 자른 분기 검색 소스들
export function quarterlySources(now = new Date()): Source[] {
  const out: Source[] = [];
  for (let i = 0; i < QUARTERS; i++) {
    const before = new Date(now);
    before.setMonth(before.getMonth() - 3 * i);
    before.setDate(before.getDate() + 1); // before:는 해당 날짜를 포함하지 않는다
    const after = new Date(now);
    after.setMonth(after.getMonth() - 3 * (i + 1));
    QUERIES.forEach((query, qi) => {
      out.push({
        id: `q${i}-${qi}`,
        name: `${ymd(after)}~${ymd(before)}`,
        region: query.lang === "ko" ? "kr" : "intl",
        lang: query.lang,
        url: googleNews(`${query.q} after:${ymd(after)} before:${ymd(before)}`, query.lang),
        maxAgeDays: 31 * 3 * QUARTERS,
        mustMatch: VIETNAM_RE,
      });
    });
  }
  return out;
}

async function generate(current: Article[]) {
  try {
    const sources = quarterlySources();
    const results = [];
    // Google에 한꺼번에 몰리지 않도록 4개씩 나눠 요청
    for (let i = 0; i < sources.length; i += 4) {
      results.push(...(await Promise.all(sources.slice(i, i + 4).map(fetchSource))));
    }
    const pool = buildPool([
      ...results.flatMap((r) => r.articles.slice(0, PER_QUERY)),
      ...current.filter((a) => !a.section && a.interest >= 6),
    ]);
    if (pool.length < 50) throw new Error(`기사가 너무 적음 (${pool.length}건)`);

    const lines = pool.map((a, i) => `${i}\t${ymd(new Date(a.publishedAt))}\t${a.publisher}\t${a.title}`).join("\n");
    const client = new Anthropic();
    // 출력이 길어 스트리밍으로 받는다 (HTTP 타임아웃 방지)
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content: `id\tdate\tpublisher\theadline\n${lines}` }],
      })
      .finalMessage();
    if (response.stop_reason === "refusal") throw new Error("요청이 거절됨");
    if (response.stop_reason === "max_tokens") throw new Error("응답이 잘림 (max_tokens)");

    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = JSON.parse(text) as {
      stories: { headline: string; summary: string; talking_point: string; category: string; ids: number[] }[];
    };

    const stories: TopStory[] = parsed.stories.slice(0, MAX_STORIES).map((s, i) => {
      // 모델이 준 id 중 실제로 있는 기사만 근거로 남긴다
      const articles = [...new Set(s.ids)]
        .filter((id) => Number.isInteger(id) && id >= 0 && id < pool.length)
        .map((id) => pool[id])
        .sort((a, b) => a.publishedAt - b.publishedAt)
        .map((a) => ({ title: a.title, link: a.link, publisher: a.publisher, publishedAt: a.publishedAt }));
      return {
        rank: i + 1,
        headline: s.headline,
        summary: s.summary,
        talkingPoint: s.talking_point,
        category: s.category,
        period: period(articles.map((a) => a.publishedAt)),
        articles,
      };
    });

    state = { enabled: true, generatedAt: Date.now(), stories, poolSize: pool.length, error: undefined };
  } catch (e) {
    lastFailureAt = Date.now();
    state = { ...state, error: describeError(e) };
  }
}

function buildPool(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of articles) {
    const key = a.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function period(times: number[]): string {
  if (times.length === 0) return "";
  const fmt = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const first = fmt(Math.min(...times));
  const last = fmt(Math.max(...times));
  return first === last ? first : `${first}~${last}`;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "ANTHROPIC_API_KEY가 올바르지 않음";
  if (e instanceof Anthropic.RateLimitError) return "요청 한도 초과, 잠시 후 다시 시도";
  if (e instanceof Anthropic.APIError) return `API 오류 ${e.status}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
