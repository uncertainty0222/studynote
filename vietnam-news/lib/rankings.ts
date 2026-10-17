// 기간별·지역별 베트남 뉴스 순위 (Claude가 기사 제목을 읽고 같은 사건을 묶어 30위까지 매긴다).
// ANTHROPIC_API_KEY가 없으면 아무것도 하지 않는다.
//
// - 재료: Google News 검색 RSS(영·한·베). 검색당 약 100건이 한계라 긴 기간은 구간을 나눠 검색한다.
// - '일주일'(기본 화면)은 월~일 고정 주간이다. 매주 월요일 06시(베트남 시간)에 서버가 지난주 순위를 자동으로 만들고
//   다음 일요일까지 그대로 쓴다 (startWeeklyScheduler, instrumentation.ts에서 시작).
// - 나머지 기간은 누군가 그 탭을 열었을 때만 만들고, 기간별 갱신 주기(PERIODS.refreshHours) 동안 저장해 둔다.
// - 여러 순위가 동시에 요청돼도 한 번에 하나씩 만든다.
// - 요약은 제목만 보고 쓰므로 세부 수치는 원문 링크로 확인해야 한다.

import Anthropic from "@anthropic-ai/sdk";
import { fetchFeed, googleNews, pubmedSearch, VIETNAM_RE, type FeedRequest, type Headline } from "./feeds";

export type PeriodId = "day" | "week" | "month" | "year" | "threeYear";
export type ScopeId = "national" | "nhatrang" | "dalat" | "expat" | "specialty";

export const PERIODS: Record<PeriodId, { label: string; days: number; windows: number; perQuery: number; refreshHours: number }> = {
  day: { label: "일간", days: 1, windows: 1, perQuery: 100, refreshHours: 6 },
  week: { label: "주간", days: 7, windows: 1, perQuery: 100, refreshHours: 24 * 7 }, // 실제 갱신은 월요일 스케줄러
  month: { label: "월간", days: 30, windows: 1, perQuery: 100, refreshHours: 48 },
  year: { label: "1년", days: 365, windows: 4, perQuery: 30, refreshHours: 336 },
  threeYear: { label: "3년", days: 1095, windows: 6, perQuery: 25, refreshHours: 720 },
};

// 무료로 보는 범위: 주간 순위의 1~10위. 나머지 기간과 11위 이하는 이용권이 있어야 서버가 보내 준다
export const FREE_PERIOD: PeriodId = "week";
export const FREE_RANKS = 10;
export const PERIOD_IDS = Object.keys(PERIODS) as PeriodId[];

type Query = {
  lang: "en" | "ko" | "vi";
  q: string;
  mustMatch?: RegExp | RegExp[];
  excludeTitle?: RegExp;
  source?: "pubmed"; // 기본은 Google News. pubmed는 논문 검색 (q는 PubMed 검색식)
};

const NHATRANG_RE = /nha trang|khanh hoa|khánh hòa|cam ranh|나트랑|냐짱|카인호아|깜라인/i;
const DALAT_RE = /da lat|dalat|đà lạt|달랏|lang biang|langbiang/i;

// 특산품: 침향, 커피, 상황버섯, 아티소, 보석·진주·옥, 제비집, 동충하초 (한·베·영, 논문 학명 포함)
// pearl은 단어 경계를 둬서 Vinpearl은 걸리지 않는다. '옥'은 한 글자 단어로만 (옥상·옥수수 제외)
const SPECIALTY_RE =
  /trầm hương|kỳ nam|agarwood|aquilaria|\boud\b|침향|cà phê|coffee|robusta|arabica|커피|thượng hoàng|phellinus|상황버섯|atiso|actiso|artichoke|cynara|아티소|아티초크|đá quý|gemstones?|\bgems?\b|ruby|sapphire|보석|ngọc trai|\bpearls?\b|pinctada|진주|ngọc bích|cẩm thạch|\bjade\b|비취|(?<![가-힣])옥(?![가-힣])|yến sào|tổ yến|chim yến|bird'?s nest|swiftlet|aerodramus|제비집|đông trùng hạ thảo|cordyceps|동충하초/i;
// 매일 나오는 시세 기사(예: "Giá cà phê hôm nay 14/10")는 사건이 아니므로 뺀다
const DAILY_PRICE_RE = /giá (cà phê|tiêu|yến)[^,:]*(hôm nay|ngày \d)|coffee prices? today/i;

const DEFAULT_CATEGORIES = "국제정세, 국내정책, 경제, 한국 관련, 관광, 사회, 문화, 날씨·재해";

export const SCOPES: Record<
  ScopeId,
  {
    label: string;
    queries: Query[];
    focus: string;
    categories?: string;
    weeklyOnly?: boolean;
    carryOverWeeks?: number; // 주간 순위가 30위를 못 채우면 최대 이 주 수만큼 지난 주 순위로 채운다
  }
> = {
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
  // 교민·관광업 생활정보: 일주일 전용 (일요일 밤이 지난 월요일 아침에 자동 생성)
  // 교민생활: 외국인으로서 베트남(특히 나트랑)에서 사는 데 필요한 정책·제도 뉴스. 주간 전용
  expat: {
    label: "교민생활",
    weeklyOnly: true,
    queries: [
      // 비자·거주·외국인 제도
      {
        lang: "vi",
        q: '"người nước ngoài" ("thị thực" OR visa OR "thẻ tạm trú" OR "cư trú" OR "giấy phép lao động" OR "giấy phép lái xe" OR "bảo hiểm" OR "kết hôn")',
      },
      // 부동산·은행
      {
        lang: "vi",
        q: '"người nước ngoài" ("nhà ở" OR "bất động sản" OR "sở hữu" OR "ngân hàng" OR "tài khoản" OR "sinh trắc học" OR "chuyển tiền")',
      },
      // 세금·상업
      {
        lang: "vi",
        q: '("thuế" OR "hóa đơn điện tử" OR "hộ kinh doanh" OR "đăng ký kinh doanh" OR "tỷ giá" OR "ngoại tệ") ("quy định" OR "nghị định" OR "thông tư" OR "từ ngày")',
      },
      // 암호화폐
      {
        lang: "vi",
        q: '("tiền mã hóa" OR "tài sản số" OR "tài sản mã hóa" OR "sàn giao dịch") ("quy định" OR "nghị quyết" OR "thí điểm" OR "pháp lý")',
      },
      // 나트랑·카인호아 정책 (가중치)
      {
        lang: "vi",
        q: '("Nha Trang" OR "Khánh Hòa") ("quy định" OR "chính sách" OR "UBND" OR "người nước ngoài" OR "xử phạt" OR "cấm")',
        mustMatch: NHATRANG_RE,
      },
      {
        lang: "en",
        q: 'Vietnam (foreigners OR expats OR "foreign residents" OR "work permit" OR "residence card" OR "foreign ownership" OR "e-visa" OR "digital assets" OR "crypto")',
        mustMatch: VIETNAM_RE,
      },
      {
        lang: "ko",
        q: "베트남 (교민 OR 한인 OR 체류 OR 비자 OR 워크퍼밋 OR 거주증 OR 부동산 OR 은행 OR 송금 OR 세금 OR 가상자산 OR 코인)",
        mustMatch: VIETNAM_RE,
      },
    ],
    focus: `Pick only news a foreigner living in Vietnam needs for daily life, especially Korean residents in Nha Trang. Topics:
- visas and residence: e-visas, visa exemptions, temporary residence cards, work permits, overstay rules;
- real estate: foreign ownership, buying or renting housing, property rules;
- banking and money: bank accounts and biometric checks for foreigners, payments, remittance, exchange rates, foreign currency;
- business and commerce: business registration, household businesses, e-invoices, licensing, inspections and fines;
- taxes: personal income tax, business tax, tax debts and exit bans;
- crypto and digital assets: legal status, exchanges, pilot programmes;
- rules for foreigners: driving licences, health insurance, schools, marriage, police registration;
- incidents and crackdowns that affect foreigners or Korean residents.
Give extra weight to policies and rules from Nha Trang / Khanh Hoa. Rank by how widely discussed the story is (xN) and how much it changes daily life. Skip general politics, diplomacy, macroeconomics, tourism marketing and entertainment unless they directly change rules for foreign residents. When a rule has an effective date, fine or threshold in the headline, put it in f.`,
    categories: "비자·거주, 부동산, 은행·환율, 사업·상업, 세금, 암호화폐, 외국인 제도, 사건사고, 나트랑 정책",
  },
  // 특산품: 나트랑·달랏 쇼핑 품목 뉴스. 기사가 적은 분야라 연구·논문도 넣는다. 주간 전용
  specialty: {
    label: "나트랑·달랏 특산품",
    weeklyOnly: true,
    carryOverWeeks: 4,
    queries: [
      {
        lang: "vi",
        q: '"trầm hương" OR "kỳ nam" OR "yến sào" OR "tổ yến" OR "đông trùng hạ thảo" OR "nấm thượng hoàng"',
        mustMatch: SPECIALTY_RE,
        excludeTitle: DAILY_PRICE_RE,
      },
      {
        lang: "vi",
        q: '"cà phê" ("Lâm Đồng" OR "Đà Lạt" OR "xuất khẩu" OR Arabica OR Robusta OR "chỉ dẫn địa lý") -"giá cà phê hôm nay"',
        mustMatch: SPECIALTY_RE,
        excludeTitle: DAILY_PRICE_RE,
      },
      {
        lang: "vi",
        q: '"atiso" OR "actiso" OR "ngọc trai" OR "đá quý" OR "ngọc bích" OR "cẩm thạch"',
        mustMatch: SPECIALTY_RE,
        excludeTitle: DAILY_PRICE_RE,
      },
      // 국내 언론의 연구 소식
      {
        lang: "vi",
        q: '("trầm hương" OR "yến sào" OR "đông trùng hạ thảo" OR "atiso" OR "nấm thượng hoàng" OR "ngọc trai" OR "cà phê") ("nghiên cứu" OR "nhà khoa học" OR "công bố" OR "đề tài" OR "bằng sáng chế")',
        mustMatch: SPECIALTY_RE,
        excludeTitle: DAILY_PRICE_RE,
      },
      {
        lang: "en",
        q: 'Vietnam (agarwood OR "bird\'s nest" OR swiftlet OR cordyceps OR artichoke OR pearl OR jade OR gemstone OR "Phellinus")',
        mustMatch: [SPECIALTY_RE, VIETNAM_RE],
        excludeTitle: DAILY_PRICE_RE,
      },
      {
        lang: "en",
        q: 'Vietnam coffee (export OR robusta OR arabica OR "Lam Dong" OR "Da Lat" OR harvest)',
        mustMatch: [SPECIALTY_RE, VIETNAM_RE],
        excludeTitle: DAILY_PRICE_RE,
      },
      {
        lang: "ko",
        q: "베트남 (침향 OR 제비집 OR 상황버섯 OR 동충하초 OR 아티소 OR 아티초크 OR 커피 OR 진주 OR 보석 OR 침향환)",
        mustMatch: [SPECIALTY_RE, VIETNAM_RE],
        excludeTitle: DAILY_PRICE_RE,
      },
      // 논문 (PubMed): 품목 학명·영문명. 커피는 논문이 너무 많아 베트남 관련만
      {
        lang: "en",
        source: "pubmed",
        q: '(agarwood OR Aquilaria OR "edible bird\'s nest" OR swiftlet OR "Cordyceps militaris" OR "Phellinus linteus" OR "Cynara scolymus" OR Pinctada) OR (coffee AND (Vietnam OR Vietnamese))',
      },
    ],
    focus: `Pick news about the regional specialty products sold to visitors in Nha Trang and Da Lat: agarwood (trầm hương, kỳ nam), coffee (especially Lam Dong / Da Lat), Phellinus linteus mushroom (nấm thượng hoàng, 상황버섯), artichoke (atiso), gemstones, pearls, jade, edible bird's nest (yến sào), cordyceps (đông trùng hạ thảo).
Rank first by how widely discussed the story is (xN) and its impact: export deals and prices moving sharply, new rules and certification (geographical indications, food safety, quarantine, customs limits for travellers), counterfeit or fraud cases and crackdowns, harvest failures, big investments, anything involving Korean buyers or tourists, Khanh Hoa and Lam Dong stories.
News on these products is scarce, so also include research: Vietnamese press reports on studies, and lines from PubMed (journal articles, usually English titles). For research use only what the title states; do not claim health benefits beyond it. Prefer research done in Vietnam or with practical meaning (quality, authenticity testing, cultivation, safety). Keep at most 3 research items in the top 10, and no product more than 3 times in the top 10 unless there is little else.
Skip routine daily price bulletins, advertisements and product promotions, and stories that only mention a product in passing.
For research items, set st to "연구 발표". When a headline has a price, export value, volume or percentage, put it in f.`,
    categories: "침향, 커피, 상황버섯, 아티소, 보석·진주·옥, 제비집, 동충하초, 기타 특산품",
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
  weeksAgo?: number; // 지난 주 순위에서 가져와 채운 항목이면 몇 주 전인지
};

export type Ranking = {
  scope: ScopeId;
  period: PeriodId;
  enabled: boolean;
  status: "idle" | "pending" | "ready" | "error" | "locked"; // locked: 이용권이 필요한 기간
  generatedAt: number | null;
  poolSize: number;
  stories: RankedStory[];
  rangeLabel?: string; // 일주일: "10.13(월)~10.19(일)"
  weekKey?: string; // 일주일: 그 주 월요일 날짜
  usage?: Usage; // 이 순위를 만들 때 쓴 토큰
  lockedCount?: number; // 무료 독자에게 보내지 않은 11위 이하 개수
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
  history: Map<string, RankedStory[]>; // "scope:weekKey" → 그 주에 만든 순위 (지난 주로 채우기용)
};
const G = globalThis as unknown as { __vnTop10?: Shared };
const shared: Shared = (G.__vnTop10 ??= {
  store: new Map(),
  queue: Promise.resolve(),
  totals: { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, since: Date.now() },
  schedulerStarted: false,
  history: new Map(),
});
shared.history ??= new Map(); // 이 필드가 생기기 전에 만들어진 저장소 대비
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
export function getRanking(scope: ScopeId, requested: PeriodId, premium = false): Ranking {
  const period: PeriodId = SCOPES[scope].weeklyOnly ? "week" : requested; // 교민생활·특산품은 주간만 있다
  // 유료 기간은 이용권이 없으면 만들지도 않는다 (토큰은 결제한 독자가 쓸 때만 든다)
  if (period !== FREE_PERIOD && !premium) {
    return { scope, period, enabled: Boolean(process.env.ANTHROPIC_API_KEY), status: "locked", generatedAt: null, poolSize: 0, stories: [] };
  }
  const enabled = Boolean(process.env.ANTHROPIC_API_KEY);
  const entry = ensureEntry(scope, period);
  entry.enabled = enabled;
  if (!enabled) return view(entry, premium);

  // 일주일은 일요일 스케줄러만 만든다 (페이지를 연다고 토큰을 쓰지 않는다)
  if (period === "week") {
    startWeeklyScheduler(); // instrumentation에서 이미 시작했으면 아무것도 안 한다
    if (entry.stories.length === 0 && entry.status !== "error") entry.status = "pending";
    return view(entry, premium);
  }

  const stale = !entry.generatedAt || Date.now() - entry.generatedAt > PERIODS[period].refreshHours * 3600_000;
  if (stale) enqueue(entry);
  return view(entry, premium);
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
// 월요일 06시에 지난주(월~일) 순위를 만든다. 일요일 밤 뉴스와 Google 색인 지연까지 담기 위해서다
const PUBLISH_HOUR_ICT = 6;
const SCHEDULER_INTERVAL_MS = 15 * 60_000;

// 지금 기준 가장 최근에 발행된 주간: 이번 주 월요일 06시가 지났으면 지난주, 아니면 지지난주
export function weekRange(now = new Date()) {
  const local = now.getTime() + ICT_OFFSET_MS; // UTC 필드로 읽으면 베트남 현지 시각
  const d = new Date(local);
  let publishMonday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // 이번 주 월요일 0시(현지)
  if (local < publishMonday + PUBLISH_HOUR_ICT * 3600_000) publishMonday -= 7 * 86400_000;
  const monday = publishMonday - 7 * 86400_000;
  const sunday = publishMonday - 86400_000;
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

// 무료 독자에게는 10위까지만 보낸다 (화면에서 가리는 게 아니라 데이터를 안 보낸다)
function view(e: Entry, premium: boolean): Ranking {
  const stories = premium ? e.stories : e.stories.slice(0, FREE_RANKS);
  return {
    scope: e.scope,
    period: e.period,
    enabled: e.enabled,
    status: e.status,
    generatedAt: e.generatedAt,
    poolSize: e.poolSize,
    stories,
    lockedCount: e.stories.length - stories.length,
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
    if (query.source === "pubmed") {
      // 논문은 주간 전용 섹션에서만 쓴다. 그 주 월~일에 PubMed에 등록된 것
      if (period !== "week") continue;
      const w = weekRange(now);
      const sunday = new Date(Date.parse(`${w.key}T00:00:00Z`) + 6 * 86400_000);
      out.push({
        url: pubmedSearch(query.q, w.key, ymd(sunday)),
        kind: "pubmed",
        maxAgeDays: 3650,
        mustMatch: query.mustMatch,
        fromMs: w.fromMs,
        toMs: w.toMs,
      });
      continue;
    }
    if (period === "week") {
      const w = weekRange(now);
      out.push({
        url: googleNews(`${query.q} after:${w.after} before:${w.before}`, query.lang),
        maxAgeDays: Math.ceil((Date.now() - w.fromMs) / 86400_000) + 2, // 지난 주로 채울 때 몇 주 전 주도 받도록
        mustMatch: query.mustMatch,
        excludeTitle: query.excludeTitle,
        fromMs: w.fromMs,
        toMs: w.toMs,
      });
      continue;
    }
    if (p.windows === 1) {
      out.push({
        url: googleNews(`${query.q} when:${p.days}d`, query.lang),
        maxAgeDays: p.days + 1,
        mustMatch: query.mustMatch,
        excludeTitle: query.excludeTitle,
      });
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
        excludeTitle: query.excludeTitle,
      });
    }
  }
  return out;
}

async function collect(scope: ScopeId, period: PeriodId, now = new Date()): Promise<Headline[]> {
  const requests = buildRequests(scope, period, now);
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
    const carry = period === "week" ? (SCOPES[scope].carryOverWeeks ?? 0) : 0;
    const now = new Date();
    const result = await rank(scope, period, now, carry > 0);
    const filled = carry > 0 ? await fillFromPastWeeks(scope, result, now, carry) : result;
    if (filled.stories.length === 0) throw new Error(`기사가 너무 적음 (${result.poolSize}건)`);

    entry.stories = filled.stories;
    entry.poolSize = result.poolSize;
    entry.usage = filled.usage ?? undefined;
    if (result.week) {
      entry.weekKey = result.week.key;
      entry.rangeLabel = result.week.label;
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

type RankResult = { stories: RankedStory[]; poolSize: number; usage: Usage | null; week: ReturnType<typeof weekRange> | null };

// 이번 주 순위가 30위를 못 채우면 지난주, 지지난주 … 순위로 채운다 (최대 carry주 전까지).
// 지난 주 순위는 만들어 둔 것을 다시 쓰고, 서버 재시작 등으로 없으면 그 주 기사로 새로 만든다
async function fillFromPastWeeks(scope: ScopeId, current: RankResult, now: Date, carry: number): Promise<RankResult> {
  const history = shared.history;
  const keyOf = (back: number) => `${scope}:${weekRange(new Date(now.getTime() - back * WEEK_MS)).key}`;
  history.set(keyOf(0), current.stories);

  const out = [...current.stories];
  let usage = current.usage;
  for (let back = 1; back <= carry && out.length < MAX_STORIES; back++) {
    let past = history.get(keyOf(back));
    if (!past) {
      try {
        const r = await rank(scope, "week", new Date(now.getTime() - back * WEEK_MS), true);
        past = r.stories;
        history.set(keyOf(back), past);
        usage = addUsage(usage, r.usage);
      } catch {
        continue; // 그 주를 못 만들면 건너뛰고 더 이전 주로 채운다 (다음 발행 때 다시 시도)
      }
    }
    for (const s of past) {
      if (out.length >= MAX_STORIES) break;
      if (out.some((o) => sameStory(o, s))) continue; // 이번 주에도 이어진 이야기는 한 번만
      out.push({ ...s, weeksAgo: back });
    }
  }

  // 채우기에 더 이상 쓰지 않을 오래된 주는 지운다
  const keep = new Set(Array.from({ length: carry + 1 }, (_, i) => keyOf(i)));
  for (const k of history.keys()) if (k.startsWith(`${scope}:`) && !keep.has(k)) history.delete(k);

  return { ...current, stories: out.map((s, i) => ({ ...s, rank: i + 1 })), usage };
}

const WEEK_MS = 7 * 86400_000;

function sameStory(a: RankedStory, b: RankedStory) {
  if (a.articles.some((x) => b.articles.some((y) => y.link === x.link))) return true;
  return jaccard(tokenize(a.headline), tokenize(b.headline)) >= 0.5;
}

function addUsage(a: Usage | null, b: Usage | null): Usage | null {
  if (!a || !b) return a ?? b;
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd,
  };
}

// 한 기간(주간이면 now 기준 가장 최근 발행 주)의 기사를 모아 순위를 만든다.
// allowEmpty: 기사가 너무 적으면 실패 대신 빈 순위를 돌려준다 (지난 주로 채우는 섹션용)
async function rank(scope: ScopeId, period: PeriodId, now: Date, allowEmpty = false): Promise<RankResult> {
  const week = period === "week" ? weekRange(now) : null;
  const pool = await collect(scope, period, now);
  const wide = scope === "national" || scope === "expat";
  const minPool = wide ? 30 : 5;
  if (pool.length < minPool) {
    if (allowEmpty) return { stories: [], poolSize: pool.length, usage: null, week };
    throw new Error(`기사가 너무 적음 (${pool.length}건)`);
  }

  // 같은 사건의 비슷한 제목을 미리 묶어 입력을 줄인다. 묶인 수(xN)는 보도량 신호로 쓴다
  const clusters = clusterHeadlines(pool).slice(0, wide ? MAX_LINES_NATIONAL : MAX_LINES_LOCAL);
  const want = Math.min(MAX_STORIES, Math.max(5, Math.floor(clusters.length / 2)));
  const periodText = week ? `the week ${week.label}` : PERIODS[period].label;
  const system = `You are the editor of a Korean weekly newsletter about Vietnam, read by Korean residents in Vietnam (many in Nha Trang, aged 40-60) and people in the tourism business. From the numbered headlines (${periodText}, ${SCOPES[scope].label}), rank up to ${want} of the most significant stories.
${SCOPES[scope].focus}
Each line is: id, date (YYMMDD), xN = number of similar headlines merged into that line (more = wider coverage), headline. Prefer widely covered stories.

Output keys: h headline, sm summary, tp talking point, c category, st status, f figures (l label, v value), tl timeline (i headline id, e event), ids headline ids.
Rules:
- Merge lines about the same event or ongoing development into one story. ids: up to 8 of its most relevant line ids.
- Write in Korean. h: one concise line. c: one of ${SCOPES[scope].categories ?? DEFAULT_CATEGORIES}.
- Ranks 1-10:
  - sm: 2 short, plain sentences on what happened and why it matters. tp: one plain sentence on what it means for Korean residents or visitors in Vietnam (or what to keep in mind).
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
        effort: period === "day" || period === "month" ? "low" : "medium", // 주간·1년·3년은 중간
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

  const stories: RankedStory[] = parsed.s.slice(0, MAX_STORIES).map((s, i) => {
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
  return { stories, poolSize: pool.length, usage, week };
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
