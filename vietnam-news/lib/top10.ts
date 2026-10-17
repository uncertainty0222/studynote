// 최근 30일 베트남 뉴스 중 파급력이 큰 10건을 Claude가 고르고 한국어로 요약한다.
// ANTHROPIC_API_KEY가 없으면 아무것도 하지 않는다.
//
// - 재료: Google News 30일 검색(영어·한국어·베트남어) + 현재 수집된 기사 제목
// - 같은 사건을 다룬 기사를 한 건으로 묶고, 묶인 기사 수(보도량)를 근거로 함께 보여준다
// - 하루 한 번(TOP10_REFRESH_HOURS)만 갱신해 비용을 줄인다. 백그라운드에서 돈다.
// - 요약은 제목만 보고 쓰므로 세부 수치는 원문 링크로 확인해야 한다

import Anthropic from "@anthropic-ai/sdk";
import type { Article } from "./news";
import { fetchSource } from "./news";
import { googleNews, type Source } from "./sources";

export type TopStory = {
  rank: number;
  headline: string;
  summary: string;
  talkingPoint: string;
  category: string;
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
const REFRESH_MS = Number(process.env.TOP10_REFRESH_HOURS ?? 24) * 3600_000;
const RETRY_AFTER_FAILURE_MS = 30 * 60 * 1000;
const MAX_POOL = 400;

const MONTHLY_SOURCES: Source[] = [
  { id: "m-en", name: "Google News 30일 (영문)", region: "intl", lang: "en", url: googleNews("Vietnam when:30d", "en"), maxAgeDays: 31 },
  { id: "m-ko", name: "Google News 30일 (한국어)", region: "kr", lang: "ko", url: googleNews("베트남 when:30d", "ko"), maxAgeDays: 31 },
  { id: "m-vi", name: "Google News 30일 (베트남어)", region: "vn", lang: "vi", url: googleNews("Việt Nam when:30d", "vi"), maxAgeDays: 31 },
];

const SYSTEM = `You are an editor briefing a Korean tour guide who works in Vietnam. From the numbered headlines (last 30 days), pick the 10 Vietnam news stories most worth knowing. Give the most weight to:
(a) Vietnam in international affairs (relations and trade with the US, China, Japan, Russia, the EU and ASEAN; tariffs and trade deals; the South China Sea; supply chains),
(b) Korea-related Vietnam news (Korean companies, Korean residents and tourists, Korea-Vietnam diplomacy, K-culture),
(c) Vietnam news Korean tourists would care about (popular destinations, visas and entry, flights and airports, tourist safety, weather and disasters affecting travel, prices and exchange rates).
Then consider overall impact on Vietnam's economy and society. Prefer stories covered by many outlets. Skip celebrity gossip, viral social-media clips, local crime unrelated to tourists, and stories not about Vietnam.

Rules:
- Merge headlines about the same event into one story and list all their ids.
- Write in Korean. headline: one concise line. summary: 2-3 sentences explaining what happened and why it matters. talking_point: one natural sentence the guide could say to Korean tourists.
- Use only facts present in the headlines. Do not invent numbers, dates or quotes. If a detail is unclear, leave it out.
- category: one of 국제정세, 한국 관련, 관광, 정치·외교, 경제, 금융·부동산, 사회, 문화, 날씨·재해.
- Order by impact, most important first.`;

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

async function generate(current: Article[]) {
  try {
    const monthly = await Promise.all(MONTHLY_SOURCES.map(fetchSource));
    const pool = buildPool([...monthly.flatMap((r) => r.articles), ...current.filter((a) => !a.section)]);
    if (pool.length < 20) throw new Error(`기사가 너무 적음 (${pool.length}건)`);

    const lines = pool.map((a, i) => `${i}\t${fmtDate(a.publishedAt)}\t${a.publisher}\t${a.title}`).join("\n");
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `id\tdate\tpublisher\theadline\n${lines}` }],
    });
    if (response.stop_reason === "refusal") throw new Error("요청이 거절됨");
    if (response.stop_reason === "max_tokens") throw new Error("응답이 잘림 (max_tokens)");

    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = JSON.parse(text) as {
      stories: { headline: string; summary: string; talking_point: string; category: string; ids: number[] }[];
    };

    const stories: TopStory[] = parsed.stories.slice(0, 10).map((s, i) => ({
      rank: i + 1,
      headline: s.headline,
      summary: s.summary,
      talkingPoint: s.talking_point,
      category: s.category,
      // 모델이 준 id 중 실제로 있는 기사만 근거로 남긴다
      articles: [...new Set(s.ids)]
        .filter((id) => Number.isInteger(id) && id >= 0 && id < pool.length)
        .map((id) => {
          const a = pool[id];
          return { title: a.title, link: a.link, publisher: a.publisher, publishedAt: a.publishedAt };
        }),
    }));

    state = { enabled: true, generatedAt: Date.now(), stories, poolSize: pool.length, error: undefined };
  } catch (e) {
    lastFailureAt = Date.now();
    state = { ...state, error: describeError(e) };
  }
}

// 중복 제목을 지우고 최대 MAX_POOL건. 30일 검색 결과를 앞에 둬서 최근 기사에 밀려나지 않게 한다
function buildPool(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of articles) {
    const key = a.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.slice(0, MAX_POOL);
}

function fmtDate(t: number) {
  return new Date(t).toISOString().slice(0, 10);
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "ANTHROPIC_API_KEY가 올바르지 않음";
  if (e instanceof Anthropic.RateLimitError) return "요청 한도 초과, 잠시 후 다시 시도";
  if (e instanceof Anthropic.APIError) return `API 오류 ${e.status}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
