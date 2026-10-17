// 기사 제목을 한국어로 번역하고 흥미도(1~10)를 매긴다 (Claude API, 한 번의 호출로 둘 다).
// 한국어 제목은 번역 없이 흥미도만 받는다. ANTHROPIC_API_KEY가 없으면 아무것도 하지 않는다.
//
// 같은 제목은 한 번만 보내도록 메모리에 저장하고, 새 제목만 묶어서 보낸다.
// 백그라운드에서 돌고, 끝나기 전에는 원문 제목과 키워드 기반 흥미도가 쓰인다.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.TRANSLATE_MODEL || "claude-opus-5-5";
const BATCH_SIZE = 60;
const MAX_CACHE = 5000;

const SYSTEM = `You help a Korean tour guide working in Vietnam skim the news. For every headline:

1. ko: translate it into Korean (Vietnamese or English input). If the headline is already Korean, return it unchanged.
   - Natural Korean headline style, concise, no trailing period.
   - Use the Korean spellings Korean media commonly use for Vietnamese places and people (e.g. 호찌민, 다낭, 하노이, 또 럼).
   - Keep brand and person names recognizable; do not add information that is not in the headline.
2. interest: an integer 1-10 for how worth knowing it is for this guide. Weight these three kinds of story most:
   (a) Vietnam in international affairs: relations and trade with the US, China, Japan, Russia, the EU and ASEAN; tariffs and trade deals; the South China Sea; Vietnam's role in global supply chains.
   (b) Korea-related Vietnam news: Korean companies (Samsung, LG, Hyundai, Lotte, CJ...), Korean residents and tourists, Korea-Vietnam diplomacy, K-culture in Vietnam.
   (c) Vietnam news Korean tourists would care about: popular destinations (Da Nang, Nha Trang, Phu Quoc, Ha Long, Hoi An, Dalat), visas and entry, flights and airports, safety and scams aimed at tourists, weather and disasters affecting travel, prices and exchange rates.
   Scale: 8-10 = a major story in one of (a)-(c); 5-7 = a smaller story in (a)-(c), or major national news outside them; 2-4 = ordinary domestic economy, politics or culture; 1 = local crime and accidents unrelated to tourists, celebrity gossip, viral social-media clips, routine announcements, press releases, stories not about Vietnam.

Return one entry for every input id.`;

const SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, ko: { type: "string" }, interest: { type: "integer" } },
        required: ["id", "ko", "interest"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

type Entry = { ko: string; interest: number };
const cache = new Map<string, Entry>();
let running: Promise<void> | null = null;
let lastError: string | undefined;
let lastFailureAt = 0;
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

export function translationStatus() {
  return { enabled: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL, cached: cache.size, error: lastError };
}

export function getTranslation(title: string): Entry | undefined {
  return cache.get(title);
}

// 번역이 안 된 제목이 있으면 백그라운드 번역을 시작한다. 이미 돌고 있으면 그대로 둔다.
export function queueTranslations(titles: string[]) {
  if (!process.env.ANTHROPIC_API_KEY || running) return;
  // 실패 직후에는 페이지를 열 때마다 다시 호출하지 않도록 잠시 쉰다
  if (Date.now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) return;
  const pending = [...new Set(titles)].filter((t) => !cache.has(t));
  if (pending.length === 0) return;
  running = translateAll(pending).finally(() => {
    running = null;
  });
}

async function translateAll(titles: string[]) {
  const client = new Anthropic();
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE);
    try {
      const result = await translateBatch(client, batch);
      result.forEach((entry, idx) => {
        if (entry) cache.set(batch[idx], entry);
      });
      lastError = undefined;
    } catch (e) {
      lastError = describeError(e);
      lastFailureAt = Date.now();
      // 인증·요청 오류는 다음 묶음도 똑같이 실패하므로 멈춘다
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.BadRequestError) return;
    }
  }
  if (cache.size > MAX_CACHE) {
    // Map은 넣은 순서를 유지하므로 오래된 것부터 지운다
    for (const key of [...cache.keys()].slice(0, cache.size - MAX_CACHE)) cache.delete(key);
  }
}

async function translateBatch(client: Anthropic, titles: string[]): Promise<(Entry | undefined)[]> {
  const input = titles.map((text, i) => ({ id: String(i), text }));
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });

  if (response.stop_reason === "refusal") throw new Error("번역 요청이 거절됨");
  if (response.stop_reason === "max_tokens") throw new Error("번역 응답이 잘림 (max_tokens)");

  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = JSON.parse(text) as { translations: { id: string; ko: string; interest: number }[] };
  const byId = new Map(
    parsed.translations.map((t) => [t.id, { ko: t.ko.trim(), interest: Math.min(10, Math.max(1, Math.round(t.interest))) }]),
  );
  return input.map((x) => {
    const e = byId.get(x.id);
    return e && e.ko ? e : undefined;
  });
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "ANTHROPIC_API_KEY가 올바르지 않음";
  if (e instanceof Anthropic.RateLimitError) return "요청 한도 초과, 다음 갱신 때 다시 시도";
  if (e instanceof Anthropic.APIError) return `API 오류 ${e.status}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
