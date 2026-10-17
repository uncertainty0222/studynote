// 기간별·지역별 베트남 뉴스 순위 (Claude가 기사 제목을 읽고 같은 사건을 묶어 30위까지 매긴다).
// ANTHROPIC_API_KEY가 없으면 아무것도 하지 않는다.
//
// - 재료: Google News 검색 RSS(영·한·베). 검색당 약 100건이 한계라 긴 기간은 구간을 나눠 검색한다.
// - 비용: 누군가 그 탭을 열었을 때만 만들고, 기간별 갱신 주기(PERIODS.refreshHours) 동안 저장해 둔다.
//   여러 순위가 동시에 요청돼도 한 번에 하나씩 만든다.
// - 요약은 제목만 보고 쓰므로 세부 수치는 원문 링크로 확인해야 한다.

import Anthropic from "@anthropic-ai/sdk";
import { fetchFeed, googleNews, VIETNAM_RE, type FeedRequest, type Headline } from "./feeds";

export type PeriodId = "day" | "week" | "month" | "quarter" | "year";
export type ScopeId = "national" | "nhatrang" | "dalat";

export const PERIODS: Record<PeriodId, { label: string; days: number; windows: number; perQuery: number; refreshHours: number }> = {
  day: { label: "오늘", days: 1, windows: 1, perQuery: 100, refreshHours: 6 },
  week: { label: "일주일", days: 7, windows: 1, perQuery: 100, refreshHours: 24 },
  month: { label: "한 달", days: 30, windows: 1, perQuery: 100, refreshHours: 48 },
  quarter: { label: "3개월", days: 91, windows: 3, perQuery: 40, refreshHours: 168 },
  year: { label: "1년", days: 365, windows: 4, perQuery: 30, refreshHours: 336 },
};
export const PERIOD_IDS = Object.keys(PERIODS) as PeriodId[];

type Query = { lang: "en" | "ko" | "vi"; q: string; mustMatch?: RegExp };

const NHATRANG_RE = /nha trang|khanh hoa|khánh hòa|cam ranh|나트랑|냐짱|카인호아|깜라인/i;
const DALAT_RE = /da lat|dalat|đà lạt|달랏|lang biang|langbiang/i;

export const SCOPES: Record<ScopeId, { label: string; queries: Query[]; focus: string; extraFeeds?: FeedRequest[] }> = {
  national: {
    label: "베트남 전국",
    queries: [
      { lang: "en", q: "Vietnam", mustMatch: VIETNAM_RE },
      {
        lang: "en",
        q: 'Vietnam (China OR "United States" OR Trump OR tariff OR ASEAN OR "South China Sea" OR Russia OR Japan OR EU OR "trade deal")',
        mustMatch: VIETNAM_RE,
      },
      {
        lang: "en",
        q: 'Vietnam (reform OR law OR decree OR resolution OR "National Assembly" OR Politburo OR "party chief" OR merger OR policy)',
        mustMatch: VIETNAM_RE,
      },
      { lang: "ko", q: "베트남", mustMatch: VIETNAM_RE },
      { lang: "vi", q: '"Việt Nam"' },
    ],
    focus: `Rank first the stories that changed things:
(a) international affairs: shifts in Vietnam's relations with the US, China, Russia, Japan, the EU, Korea and ASEAN; tariffs and trade deals; the South China Sea; Vietnam's place in global supply chains;
(b) domestic policy: leadership changes, institutional and administrative reforms, major new laws and resolutions, big shifts in economic, investment, visa or tourism policy;
(c) Korea-related Vietnam news and news Korean tourists would care about (destinations, visas, flights, safety, weather, prices).
Then consider large economic, social or disaster events with national impact. Skip celebrity news, local crime and stories not about Vietnam.`,
  },
  nhatrang: {
    label: "나트랑",
    queries: [
      { lang: "en", q: '"Nha Trang" OR "Khanh Hoa" OR "Cam Ranh"', mustMatch: NHATRANG_RE },
      { lang: "vi", q: '"Nha Trang" OR "Khánh Hòa" OR "Cam Ranh"', mustMatch: NHATRANG_RE },
      { lang: "ko", q: "나트랑 OR 냐짱 OR 깜라인", mustMatch: NHATRANG_RE },
    ],
    focus: `Only stories about Nha Trang, Cam Ranh or Khanh Hoa province. Rank first what a tour guide working there must know: tourism policy and visitor numbers (especially Korean tourists), flights and the airport, new resorts, infrastructure and transport, weather, typhoons and floods, beach and sea safety, incidents involving tourists, local regulations, festivals and events, prices.`,
  },
  dalat: {
    label: "달랏",
    queries: [
      { lang: "en", q: '"Da Lat" OR Dalat', mustMatch: DALAT_RE },
      { lang: "vi", q: '"Đà Lạt"', mustMatch: DALAT_RE },
      { lang: "ko", q: "달랏", mustMatch: DALAT_RE },
    ],
    focus: `Only stories about Da Lat and its immediate area. Rank first what a tour guide working there must know: tourism policy and visitor numbers (especially Korean tourists), flights and Lien Khuong airport, roads and mountain passes, landslides and weather, attractions opening or closing, incidents involving tourists, local regulations, festivals and events, prices.`,
  },
};

export type RankedStory = {
  rank: number;
  headline: string;
  summary: string;
  talkingPoint: string;
  category: string;
  period: string; // 근거 기사 날짜 범위 (예: "2025.04" 또는 "2025.04~2025.06")
  articles: Headline[];
};

export type Ranking = {
  scope: ScopeId;
  period: PeriodId;
  enabled: boolean;
  status: "idle" | "pending" | "ready" | "error";
  generatedAt: number | null;
  poolSize: number;
  stories: RankedStory[];
  error?: string;
};

const MODEL = process.env.TOP10_MODEL || "claude-opus-5-5";
const MAX_STORIES = 30;
const RETRY_AFTER_FAILURE_MS = 30 * 60 * 1000;

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

type Entry = Ranking & { failedAt: number; queued: boolean };
const store = new Map<string, Entry>();
let queue: Promise<void> = Promise.resolve();

export function modelName() {
  return MODEL;
}

// 저장된 순위를 바로 돌려주고, 없거나 오래됐으면 백그라운드 생성을 예약한다
export function getRanking(scope: ScopeId, period: PeriodId): Ranking {
  const key = `${scope}:${period}`;
  const enabled = Boolean(process.env.ANTHROPIC_API_KEY);
  let entry = store.get(key);
  if (!entry) {
    entry = { scope, period, enabled, status: "idle", generatedAt: null, poolSize: 0, stories: [], failedAt: 0, queued: false };
    store.set(key, entry);
  }
  entry.enabled = enabled;
  if (!enabled) return view(entry);

  const stale = !entry.generatedAt || Date.now() - entry.generatedAt > PERIODS[period].refreshHours * 3600_000;
  const cooling = Date.now() - entry.failedAt < RETRY_AFTER_FAILURE_MS;
  if (stale && !entry.queued && !cooling) {
    entry.queued = true;
    if (entry.stories.length === 0) entry.status = "pending";
    const e = entry;
    queue = queue.then(() => generate(e)).finally(() => {
      e.queued = false;
    });
  }
  return view(entry);
}

function view(e: Entry): Ranking {
  return {
    scope: e.scope,
    period: e.period,
    enabled: e.enabled,
    status: e.status,
    generatedAt: e.generatedAt,
    poolSize: e.poolSize,
    stories: e.stories,
    error: e.error,
  };
}

// 기간을 windows개 구간으로 나눈 검색 요청들
export function buildRequests(scope: ScopeId, period: PeriodId, now = new Date()): FeedRequest[] {
  const p = PERIODS[period];
  const out: FeedRequest[] = [];
  for (const query of SCOPES[scope].queries) {
    if (p.windows === 1) {
      out.push({ url: googleNews(`${query.q} when:${p.days}d`, query.lang), maxAgeDays: p.days + 1, mustMatch: query.mustMatch });
      continue;
    }
    const span = p.days / p.windows;
    for (let i = 0; i < p.windows; i++) {
      const before = new Date(now.getTime() - span * i * 86400_000 + 86400_000); // before:는 그 날짜를 포함하지 않는다
      const after = new Date(now.getTime() - span * (i + 1) * 86400_000);
      out.push({
        url: googleNews(`${query.q} after:${ymd(after)} before:${ymd(before)}`, query.lang),
        maxAgeDays: p.days + 2,
        mustMatch: query.mustMatch,
      });
    }
  }
  return out;
}

async function collect(scope: ScopeId, period: PeriodId): Promise<Headline[]> {
  const requests = buildRequests(scope, period);
  const perQuery = PERIODS[period].perQuery;
  const lists: Headline[][] = [];
  // Google에 한꺼번에 몰리지 않도록 4개씩 나눠 요청
  for (let i = 0; i < requests.length; i += 4) {
    const results = await Promise.all(requests.slice(i, i + 4).map(fetchFeed));
    lists.push(...results.map((r) => r.items.slice(0, perQuery)));
  }
  const seen = new Set<string>();
  const pool: Headline[] = [];
  for (const h of lists.flat()) {
    const key = h.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(h);
  }
  return pool;
}

async function generate(entry: Entry) {
  const { scope, period } = entry;
  try {
    const pool = await collect(scope, period);
    const minPool = scope === "national" ? 30 : 5;
    if (pool.length < minPool) throw new Error(`기사가 너무 적음 (${pool.length}건)`);

    const want = Math.min(MAX_STORIES, Math.max(5, Math.floor(pool.length / 2)));
    const system = `You are an editor briefing a Korean tour guide who works in Vietnam. From the numbered headlines (${PERIODS[period].label}, ${SCOPES[scope].label}), rank up to ${want} of the most significant stories.
${SCOPES[scope].focus}
Prefer stories covered by many outlets.

Rules:
- Merge headlines about the same event or the same ongoing development into one story and list all their ids.
- Write in Korean. headline: one concise line.
- Ranks 1-10: summary of 2-3 sentences on what happened and why it matters; talking_point: one natural sentence the guide could say to Korean tourists.
- Ranks 11 and below: summary of one sentence; talking_point: empty string.
- Use only facts present in the headlines. Do not invent numbers, dates or quotes. If a detail is unclear, leave it out.
- category: one of 국제정세, 국내정책, 경제, 한국 관련, 관광, 사회, 문화, 날씨·재해.
- Order by significance, most important first. If there are fewer real stories than ${want}, return fewer.`;

    const lines = pool.map((h, i) => `${i}\t${ymd(new Date(h.publishedAt))}\t${h.publisher}\t${h.title}`).join("\n");
    const client = new Anthropic();
    // 출력이 길 수 있어 스트리밍으로 받는다 (HTTP 타임아웃 방지)
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: period === "day" ? "low" : "medium", format: { type: "json_schema", schema: SCHEMA } },
        system,
        messages: [{ role: "user", content: `id\tdate\tpublisher\theadline\n${lines}` }],
      })
      .finalMessage();
    if (response.stop_reason === "refusal") throw new Error("요청이 거절됨");
    if (response.stop_reason === "max_tokens") throw new Error("응답이 잘림 (max_tokens)");

    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = JSON.parse(text) as {
      stories: { headline: string; summary: string; talking_point: string; category: string; ids: number[] }[];
    };

    entry.stories = parsed.stories.slice(0, MAX_STORIES).map((s, i) => {
      // 모델이 준 id 중 실제로 있는 기사만 근거로 남긴다
      const articles = [...new Set(s.ids)]
        .filter((id) => Number.isInteger(id) && id >= 0 && id < pool.length)
        .map((id) => pool[id])
        .sort((a, b) => a.publishedAt - b.publishedAt);
      return {
        rank: i + 1,
        headline: s.headline,
        summary: s.summary,
        talkingPoint: s.talking_point,
        category: s.category,
        period: monthRange(articles.map((a) => a.publishedAt)),
        articles,
      };
    });
    entry.poolSize = pool.length;
    entry.generatedAt = Date.now();
    entry.status = "ready";
    entry.error = undefined;
  } catch (e) {
    entry.failedAt = Date.now();
    entry.error = describeError(e);
    entry.status = entry.stories.length ? "ready" : "error";
  }
}

function monthRange(times: number[]): string {
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
