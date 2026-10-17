// 기간별·지역별 베트남 뉴스 순위 (Claude가 기사 제목을 읽고 같은 사건을 묶어 30위까지 매긴다).
// ANTHROPIC_API_KEY가 없으면 아무것도 하지 않는다.
//
// - 재료: Google News 검색 RSS(영·한·베). 검색당 약 100건이 한계라 긴 기간은 구간을 나눠 검색한다.
// - '일주일'(기본 화면)은 월~일 고정 주간이다. 매주 일요일 20시(베트남 시간)에 서버가 자동으로 만들고
//   다음 일요일까지 그대로 쓴다 (startWeeklyScheduler, instrumentation.ts에서 시작).
// - 나머지 기간은 누군가 그 탭을 열었을 때만 만들고, 기간별 갱신 주기(PERIODS.refreshHours) 동안 저장해 둔다.
// - 여러 순위가 동시에 요청돼도 한 번에 하나씩 만든다.
// - 요약은 제목만 보고 쓰므로 세부 수치는 원문 링크로 확인해야 한다.

import Anthropic from "@anthropic-ai/sdk";
import { fetchFeed, googleNews, VIETNAM_RE, type FeedRequest, type Headline } from "./feeds";

export type PeriodId = "day" | "week" | "month" | "quarter" | "year";
export type ScopeId = "national" | "nhatrang" | "dalat";

export const PERIODS: Record<PeriodId, { label: string; days: number; windows: number; perQuery: number; refreshHours: number }> = {
  day: { label: "오늘", days: 1, windows: 1, perQuery: 100, refreshHours: 6 },
  week: { label: "일주일", days: 7, windows: 1, perQuery: 100, refreshHours: 24 * 7 }, // 실제 갱신은 일요일 스케줄러
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
  status: string; // 현재 상태 한 줄 (예: "협상 중", "시행 중")
  figures: { label: string; value: string }[]; // 핵심 수치 (근거 기사 제목에 있는 숫자만)
  timeline: { date: number; event: string }[]; // 진행 경과 (날짜는 근거 기사 발행일)
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
  rangeLabel?: string; // 일주일: "10.13(월)~10.19(일)"
  weekKey?: string; // 일주일: 그 주 월요일 날짜
  usage?: Usage; // 이 순위를 만들 때 쓴 토큰
  error?: string;
};

const MODEL = process.env.TOP10_MODEL || "claude-opus-5-5";
const MAX_STORIES = 30;
const MAX_LINES_NATIONAL = 350; // 묶은 뒤 AI에게 보낼 최대 줄 수
const MAX_LINES_LOCAL = 200;
const MAX_SOURCES = 12; // 한 항목에 보여줄 근거 기사 수
const RETRY_AFTER_FAILURE_MS = 30 * 60 * 1000;

// 출력 토큰을 아끼려고 키 이름을 짧게 쓴다 (프롬프트에 뜻을 적어 둔다)
const SCHEMA = {
  type: "object",
  properties: {
    s: {
      type: "array",
      items: {
        type: "object",
        properties: {
          h: { type: "string" },
          sm: { type: "string" },
          tp: { type: "string" },
          c: { type: "string" },
          st: { type: "string" },
          f: {
            type: "array",
            items: {
              type: "object",
              properties: { l: { type: "string" }, v: { type: "string" } },
              required: ["l", "v"],
              additionalProperties: false,
            },
          },
          tl: {
            type: "array",
            items: {
              type: "object",
              properties: { i: { type: "integer" }, e: { type: "string" } },
              required: ["i", "e"],
              additionalProperties: false,
            },
          },
          ids: { type: "array", items: { type: "integer" } },
        },
        required: ["h", "sm", "tp", "c", "st", "f", "tl", "ids"],
        additionalProperties: false,
      },
    },
  },
  required: ["s"],
  additionalProperties: false,
};

// 100만 토큰당 달러 (입력, 출력). 실사용 비용 표시용
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

export type Usage = { inputTokens: number; outputTokens: number; costUsd: number | null };
// instrumentation.ts와 페이지 코드가 따로 번들돼도 같은 저장소를 쓰도록 globalThis에 둔다
type Shared = {
  store: Map<string, Entry>;
  queue: Promise<void>;
  totals: { runs: number; inputTokens: number; outputTokens: number; costUsd: number; since: number };
  schedulerStarted: boolean;
};
const G = globalThis as unknown as { __vnTop10?: Shared };
const shared: Shared = (G.__vnTop10 ??= {
  store: new Map(),
  queue: Promise.resolve(),
  totals: { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, since: Date.now() },
  schedulerStarted: false,
});
const totals = shared.totals;

export function usageTotals() {
  return { ...totals, model: MODEL, priced: MODEL in PRICES };
}

type Entry = Ranking & { failedAt: number; queued: boolean };
const store = shared.store;

export function modelName() {
  return MODEL;
}

// 저장된 순위를 바로 돌려주고, 없거나 오래됐으면 백그라운드 생성을 예약한다
export function getRanking(scope: ScopeId, period: PeriodId): Ranking {
  const enabled = Boolean(process.env.ANTHROPIC_API_KEY);
  const entry = ensureEntry(scope, period);
  entry.enabled = enabled;
  if (!enabled) return view(entry);

  // 일주일은 일요일 스케줄러만 만든다 (페이지를 연다고 토큰을 쓰지 않는다)
  if (period === "week") {
    startWeeklyScheduler(); // instrumentation에서 이미 시작했으면 아무것도 안 한다
    if (entry.stories.length === 0 && entry.status !== "error") entry.status = "pending";
    return view(entry);
  }

  const stale = !entry.generatedAt || Date.now() - entry.generatedAt > PERIODS[period].refreshHours * 3600_000;
  if (stale) enqueue(entry);
  return view(entry);
}

function enqueue(entry: Entry) {
  const cooling = Date.now() - entry.failedAt < RETRY_AFTER_FAILURE_MS;
  if (entry.queued || cooling) return;
  entry.queued = true;
  if (entry.stories.length === 0) entry.status = "pending";
  shared.queue = shared.queue.then(() => generate(entry)).finally(() => {
    entry.queued = false;
  });
}

function ensureEntry(scope: ScopeId, period: PeriodId): Entry {
  const key = `${scope}:${period}`;
  let entry = store.get(key);
  if (!entry) {
    entry = { scope, period, enabled: Boolean(process.env.ANTHROPIC_API_KEY), status: "idle", generatedAt: null, poolSize: 0, stories: [], failedAt: 0, queued: false };
    store.set(key, entry);
  }
  return entry;
}

// ── 주간 자동 생성 ──────────────────────────
const ICT_OFFSET_MS = 7 * 3600_000; // 베트남 시간 UTC+7 (서머타임 없음)
const PUBLISH_HOUR_ICT = 20; // 일요일 20시에 그 주(월~일) 순위를 만든다
const SCHEDULER_INTERVAL_MS = 15 * 60_000;

// 지금 기준 '가장 최근에 발행됐어야 할' 주간: 일요일 20시가 지났으면 이번 주, 아니면 지난 주
export function weekRange(now = new Date()) {
  const local = now.getTime() + ICT_OFFSET_MS; // UTC 필드로 읽으면 베트남 현지 시각
  const d = new Date(local);
  let sunday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()); // 이번 주 일요일 0시(현지)
  if (local < sunday + PUBLISH_HOUR_ICT * 3600_000) sunday -= 7 * 86400_000;
  const monday = sunday - 6 * 86400_000;
  const md = (t: number) => {
    const x = new Date(t);
    return `${x.getUTCMonth() + 1}.${x.getUTCDate()}`;
  };
  return {
    key: new Date(monday).toISOString().slice(0, 10),
    label: `${md(monday)}(월)~${md(sunday)}(일)`,
    fromMs: monday - ICT_OFFSET_MS,
    toMs: sunday + 86400_000 - ICT_OFFSET_MS - 1,
    // Google 검색은 날짜 단위라 앞뒤로 하루씩 여유를 두고, 정확한 범위는 fromMs/toMs로 거른다
    after: new Date(monday - 86400_000).toISOString().slice(0, 10),
    before: new Date(sunday + 2 * 86400_000).toISOString().slice(0, 10),
  };
}

// 서버가 켜질 때 한 번 시작. 이번에 발행할 주간 순위가 없으면 만든다 (서버 재시작 직후에도 한 번 만든다)
export function startWeeklyScheduler() {
  if (shared.schedulerStarted) return;
  shared.schedulerStarted = true;
  const tick = () => {
    if (!process.env.ANTHROPIC_API_KEY) return;
    const { key } = weekRange();
    for (const scope of Object.keys(SCOPES) as ScopeId[]) {
      const entry = ensureEntry(scope, "week");
      entry.enabled = true;
      if (entry.weekKey !== key) enqueue(entry);
    }
  };
  tick();
  setInterval(tick, SCHEDULER_INTERVAL_MS).unref?.();
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
    rangeLabel: e.rangeLabel,
    weekKey: e.weekKey,
    usage: e.usage,
    error: e.error,
  };
}

// 기간을 windows개 구간으로 나눈 검색 요청들
export function buildRequests(scope: ScopeId, period: PeriodId, now = new Date()): FeedRequest[] {
  const p = PERIODS[period];
  const out: FeedRequest[] = [];
  for (const query of SCOPES[scope].queries) {
    if (period === "week") {
      const w = weekRange(now);
      out.push({
        url: googleNews(`${query.q} after:${w.after} before:${w.before}`, query.lang),
        maxAgeDays: 16,
        mustMatch: query.mustMatch,
        fromMs: w.fromMs,
        toMs: w.toMs,
      });
      continue;
    }
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

    // 같은 사건의 비슷한 제목을 미리 묶어 입력을 줄인다. 묶인 수(xN)는 보도량 신호로 쓴다
    const clusters = clusterHeadlines(pool).slice(0, scope === "national" ? MAX_LINES_NATIONAL : MAX_LINES_LOCAL);
    const want = Math.min(MAX_STORIES, Math.max(5, Math.floor(clusters.length / 2)));
    const week = period === "week" ? weekRange() : null;
    const periodText = week ? `the week ${week.label}` : PERIODS[period].label;
    const system = `You are an editor briefing a Korean tour guide who works in Vietnam. From the numbered headlines (${periodText}, ${SCOPES[scope].label}), rank up to ${want} of the most significant stories.
${SCOPES[scope].focus}
Each line is: id, date (YYMMDD), xN = number of similar headlines merged into that line (more = wider coverage), headline. Prefer widely covered stories.

Output keys: h headline, sm summary, tp talking point, c category, st status, f figures (l label, v value), tl timeline (i headline id, e event), ids headline ids.
Rules:
- Merge lines about the same event or ongoing development into one story. ids: up to 8 of its most relevant line ids.
- Write in Korean. h: one concise line. c: one of 국제정세, 국내정책, 경제, 한국 관련, 관광, 사회, 문화, 날씨·재해.
- Ranks 1-10:
  - sm: 2 sentences on what happened and why it matters. tp: one natural sentence the guide could say to Korean tourists.
  - st: current state in a few words (e.g. 협상 중, 타결, 시행 중, 진행 중, 종료, 피해 수습 중).
  - f: up to 3 key numbers, e.g. {"l":"미국 관세율","v":"46% → 20%"}. Every number must appear in this story's headlines, digits copied exactly (keep %, $, units). Use "before → after" only when both numbers appear. Empty list if none.
  - tl: 2-4 key steps in order, each with the id of the line reporting it and a short description without dates.
- Ranks 11 and below: only h, c and ids; sm, tp, st empty strings; f and tl empty lists.
- Use only facts present in the headlines. Do not invent numbers, dates or quotes.
- Order by significance, most important first. Return fewer stories if there are fewer real ones.`;

    const lines = clusters
      .map((c, i) => `${i}\t${yymmdd(c.date)}\t${c.members.length > 1 ? `x${c.members.length}` : ""}\t${c.title}`)
      .join("\n");
    const client = new Anthropic();
    // 출력이 길 수 있어 스트리밍으로 받는다 (HTTP 타임아웃 방지)
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // AI의 검토(thinking) 토큰도 출력 요금이라, 짧은 기간은 낮은 강도로 충분하다
        output_config: {
          effort: period === "quarter" || period === "year" ? "medium" : "low",
          format: { type: "json_schema", schema: SCHEMA },
        },
        system,
        messages: [{ role: "user", content: lines }],
      })
      .finalMessage();
    if (response.stop_reason === "refusal") throw new Error("요청이 거절됨");
    if (response.stop_reason === "max_tokens") throw new Error("응답이 잘림 (max_tokens)");

    const usage = recordUsage(response.usage.input_tokens, response.usage.output_tokens);

    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = JSON.parse(text) as {
      s: {
        h: string;
        sm: string;
        tp: string;
        c: string;
        st: string;
        f: { l: string; v: string }[];
        tl: { i: number; e: string }[];
        ids: number[];
      }[];
    };
    const validId = (id: number) => Number.isInteger(id) && id >= 0 && id < clusters.length;

    entry.stories = parsed.s.slice(0, MAX_STORIES).map((s, i) => {
      // 모델이 준 id 중 실제로 있는 줄만 근거로 남기고, 묶여 있던 기사까지 펼친다
      const ids = [...new Set(s.ids)].filter(validId);
      const allArticles = ids.flatMap((id) => clusters[id].members).sort((a, b) => a.publishedAt - b.publishedAt);
      const sourceText = allArticles.map((a) => a.title).join(" \n ");

      // 수치는 근거 기사 제목에 그 숫자가 실제로 있을 때만 남긴다 (지어낸 숫자 차단)
      const figures = (s.f ?? [])
        .filter((f) => f.v && numbersAppearIn(f.v, sourceText))
        .slice(0, 3)
        .map((f) => ({ label: f.l, value: f.v }));

      // 타임라인 날짜는 모델이 쓴 날짜가 아니라 그 줄 기사의 발행일을 쓴다
      const seenIds = new Set<number>();
      const timeline = (s.tl ?? [])
        .filter((t) => validId(t.i) && !seenIds.has(t.i) && seenIds.add(t.i))
        .filter((t) => numbersAppearIn(t.e, clusters[t.i].members.map((m) => m.title).join(" \n ")))
        .map((t) => ({ date: clusters[t.i].date, event: t.e }))
        .sort((a, b) => a.date - b.date)
        .slice(0, 5);
      return {
        rank: i + 1,
        headline: s.h,
        summary: s.sm,
        talkingPoint: s.tp,
        category: s.c,
        period: monthRange(allArticles.map((a) => a.publishedAt)),
        status: s.st ?? "",
        figures,
        timeline,
        articles: allArticles.slice(-MAX_SOURCES), // 화면에는 최근 기사 위주로
      };
    });
    entry.poolSize = pool.length;
    entry.usage = usage;
    if (week) {
      entry.weekKey = week.key;
      entry.rangeLabel = week.label;
    }
    entry.generatedAt = Date.now();
    entry.status = "ready";
    entry.error = undefined;
  } catch (e) {
    entry.failedAt = Date.now();
    entry.error = describeError(e);
    entry.status = entry.stories.length ? "ready" : "error";
  }
}

function recordUsage(inputTokens: number, outputTokens: number): Usage {
  const price = PRICES[MODEL];
  const costUsd = price ? (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000 : null;
  totals.runs++;
  totals.inputTokens += inputTokens;
  totals.outputTokens += outputTokens;
  totals.costUsd += costUsd ?? 0;
  return { inputTokens, outputTokens, costUsd };
}

// ── 제목 묶기 ──────────────────────────────
// 단어 집합의 겹침(Jaccard)이 높으면 같은 사건의 다른 보도로 보고 한 줄로 합친다.
type Cluster = { title: string; date: number; members: Headline[]; tokens: Set<string> };

const STOPWORDS = new Set(
  "the a an of to in on for and or with as at by from is are be its it this that after over into amid vs says say said will new than more has have vietnam viet nam việt và của các cho với trong được là có những một này đã sẽ tại từ về theo 베트남 및 등 위해 대한 관련".split(
    " ",
  ),
);

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((w) => (/[가-힣]{2,}$/.test(w) ? w.replace(KO_PARTICLE, "") : w)) // 한국어 조사 떼기: 중부에 → 중부
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

const KO_PARTICLE = /(에서|으로|에게|까지|부터|에는|은|는|이|가|을|를|의|에|로|와|과|도)$/;

function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

export function clusterHeadlines(pool: Headline[], threshold = 0.5): Cluster[] {
  const clusters: Cluster[] = [];
  for (const h of pool) {
    const tokens = tokenize(h.title);
    const hit = tokens.size >= 3 ? clusters.find((c) => jaccard(c.tokens, tokens) >= threshold) : undefined;
    if (hit) {
      hit.members.push(h);
      hit.date = Math.min(hit.date, h.publishedAt);
    } else {
      clusters.push({ title: h.title, date: h.publishedAt, members: [h], tokens });
    }
  }
  // 많이 보도된 묶음을 앞에 둬서 줄 수 제한에 걸려도 큰 사건이 남게 한다
  return clusters.sort((a, b) => b.members.length - a.members.length);
}

function yymmdd(t: number) {
  return new Date(t).toISOString().slice(2, 10).replace(/-/g, "");
}

// text 안의 숫자가 모두 source에도 있는지 (1,800 / 1.800 / 1800은 같은 숫자로 본다)
export function numbersAppearIn(text: string, source: string): boolean {
  const norm = (t: string) => t.replace(/(\d)[.,](?=\d{3}\b)/g, "$1");
  const nums = norm(text).match(/\d+(?:[.,]\d+)?/g) ?? [];
  const src = norm(source).replace(/(\d),(\d)/g, "$1.$2");
  return nums.every((n) => {
    const escaped = n.replace(",", ".").replace(".", "[.,]");
    return new RegExp(`(?<![\\d.,])${escaped}(?![\\d])`).test(src);
  });
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
