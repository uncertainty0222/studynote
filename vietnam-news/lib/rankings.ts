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
import { formatMoney, krwRates, parseAmount, significantDigits } from "./fx";
import { fetchFeed, googleNews, pubmedSearch, VIETNAM_RE, type FeedRequest, type Headline } from "./feeds";

export type PeriodId = "day" | "week" | "month" | "year" | "threeYear";
export type ScopeId = "national" | "nhatrang" | "dalat" | "expat" | "specialty" | "realestate";

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

// 특산품: 침향, 상황버섯, 커피 (한·베·영, 논문 학명 포함)
const SPECIALTY_RE =
  /trầm hương|kỳ nam|agarwood|aquilaria|\boud\b|침향|기남|thượng hoàng|phellinus|상황버섯|cà phê|coffee|robusta|arabica|커피/i;
const COFFEE_RE = /cà phê|coffee|robusta|arabica|커피/i;
// 매일 나오는 시세 기사(예: "Giá cà phê hôm nay 14/10")는 사건이 아니므로 뺀다
const DAILY_PRICE_RE = /giá (cà phê|trầm hương)[^,:]*(hôm nay|ngày \d)|coffee prices? today/i;

// 부동산: 개발·분양·시세·토지·임대·외국인 소유 관련 단어 (나트랑 일반 뉴스를 거르려고 함께 맞춘다)
const PROPERTY_RE =
  /bất động sản|chung cư|căn hộ|nhà ở|giá đất|đất nền|đấu giá|quy hoạch|dự án|condotel|biệt thự|khu đô thị|sổ hồng|sổ đỏ|thuê nhà|real estate|property|condo|apartment|villa|\bland\b|housing|developer|부동산|아파트|콘도|분양|레지던스|빌라|토지|임대/i;

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
    topCaps?: Record<string, number>; // 분류별 TOP 10 안 최대 개수. 넘치는 항목은 11위 아래로 내린다
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
  // 해외생활: 한국 교민이 베트남에서 살아가는 데 필요한 제도·행정 뉴스 (지역 가중치 없음. 지역 소식은 나트랑·달랏 탭). 주간 전용
  expat: {
    label: "해외생활 (베트남 교민 생활 제도)",
    weeklyOnly: true,
    queries: [
      // 이민: 비자·체류·워크퍼밋·영주·국적·혼인
      {
        lang: "vi",
        q: '"người nước ngoài" ("thị thực" OR visa OR "thẻ tạm trú" OR "thẻ thường trú" OR "giấy phép lao động" OR "quốc tịch" OR "kết hôn" OR "trục xuất")',
      },
      // 행정: 거주 신고·서류·공증·운전면허·행정 절차
      {
        lang: "vi",
        q: '"người nước ngoài" ("khai báo tạm trú" OR "thủ tục" OR "hành chính" OR "công chứng" OR "hợp pháp hóa" OR "giấy phép lái xe" OR "định danh")',
      },
      // 부동산: 외국인 주택 소유·임대·토지
      {
        lang: "vi",
        q: '("người nước ngoài" OR "nước ngoài") ("sở hữu nhà" OR "nhà ở" OR "thuê nhà" OR "bất động sản" OR "đất đai" OR "chung cư")',
      },
      // 상업: 사업자 등록, 가계사업자, 인허가, 전자상거래, 외국인 투자 소규모 사업
      {
        lang: "vi",
        q: '("hộ kinh doanh" OR "đăng ký kinh doanh" OR "giấy phép kinh doanh" OR "thương mại điện tử" OR "doanh nghiệp FDI" OR "nhà đầu tư nước ngoài") ("quy định" OR "nghị định" OR "thông tư" OR "từ ngày")',
      },
      // 세금: 개인소득세, 사업세, 전자 세금계산서, 정산, 출국 금지
      {
        lang: "vi",
        q: '("thuế thu nhập cá nhân" OR "thuế khoán" OR "hóa đơn điện tử" OR "quyết toán thuế" OR "nợ thuế" OR "tạm hoãn xuất cảnh") ("quy định" OR "từ ngày" OR "người nước ngoài" OR "mới")',
      },
      // 은행·외환·노동·보험: 계좌·생체 인증·송금·환율 규정, 외국인 사회보험
      {
        lang: "vi",
        q: '("ngân hàng" OR "ngoại tệ" OR "chuyển tiền" OR "sinh trắc học" OR "bảo hiểm xã hội" OR "bảo hiểm y tế") ("người nước ngoài" OR "quy định mới" OR "từ ngày")',
      },
      {
        lang: "en",
        q: 'Vietnam (foreigners OR expats OR "foreign residents") (visa OR "work permit" OR "residence card" OR property OR tax OR "business license" OR bank OR regulation)',
        mustMatch: VIETNAM_RE,
      },
      {
        lang: "ko",
        q: "베트남 (교민 OR 한인 OR 체류 OR 비자 OR 워크퍼밋 OR 거주증 OR 부동산 OR 세금 OR 법인 OR 사업자 OR 송금 OR 영사관)",
        mustMatch: VIETNAM_RE,
      },
    ],
    focus: `Readers: Korean expats living anywhere in Vietnam (residents, business owners, employees, families).
Pick only news about the rules, procedures and costs they must deal with to live, work and do business in Vietnam:
- administration: residence registration, police and paperwork procedures, notarisation and legalisation, IDs for foreigners, driving licences, changes from provincial or ministry reforms that alter where and how foreigners file papers;
- immigration: visas and visa exemptions, temporary and permanent residence cards, work permits, citizenship, marriage and family status, overstay fines, deportation, crackdowns on foreigners working illegally;
- real estate: foreign ownership of homes and condos, leasing rules, land law changes that affect foreigners;
- business and commerce: business registration, household businesses, licences, e-commerce rules, rules for small foreign-owned businesses;
- taxes: personal income tax, business and lump-sum tax, e-invoices, tax finalisation, tax debts and exit bans;
- banking and money: bank accounts and biometric checks for foreigners, remittance, foreign-currency rules;
- labour and insurance: labour law changes, social and health insurance for foreigners, schools for foreign children;
- Korea–Vietnam: Korean embassy or consulate notices and agreements that change rules for Korean residents.
Rank by impact and importance: how many Korean expats it affects, how directly (legal status, money, ability to work or run a business), how soon (already in force or taking effect soon), then how widely covered it is (xN). Do not favour any city or province; local stories count only when they change rules that many expats deal with.
Skip general politics, diplomacy, macroeconomics, big investment deals, tourism, weather, local incidents, celebrity and entertainment unless they directly change these rules. In tp, say concretely what an expat should do or check. When a rule has an effective date, fine or threshold in the headline, put it in f.`,
    categories: "행정, 이민·체류, 부동산, 사업·상업, 세금, 은행·외환, 노동·보험, 한-베 영사",
  },
  // 특산품: 나트랑·달랏 쇼핑 품목 뉴스. 기사가 적은 분야라 연구·논문도 넣는다. 주간 전용
  specialty: {
    label: "나트랑·달랏 특산품 (침향·상황버섯·커피)",
    weeklyOnly: true,
    carryOverWeeks: 4,
    topCaps: { 커피: 1 },
    queries: [
      { lang: "vi", q: '"trầm hương" OR "kỳ nam"', mustMatch: SPECIALTY_RE, excludeTitle: DAILY_PRICE_RE },
      { lang: "vi", q: '"nấm thượng hoàng"', mustMatch: SPECIALTY_RE },
      // 국내 언론의 연구 소식
      {
        lang: "vi",
        q: '("trầm hương" OR "nấm thượng hoàng") ("nghiên cứu" OR "nhà khoa học" OR "công bố" OR "đề tài" OR "bằng sáng chế")',
        mustMatch: SPECIALTY_RE,
      },
      // 커피는 TOP 10에 1건만 쓰므로 검색도 하나만
      {
        lang: "vi",
        q: '"cà phê" ("Lâm Đồng" OR "Đà Lạt" OR "xuất khẩu" OR Arabica OR Robusta OR "chỉ dẫn địa lý") -"giá cà phê hôm nay"',
        mustMatch: COFFEE_RE,
        excludeTitle: DAILY_PRICE_RE,
      },
      { lang: "en", q: 'Vietnam (agarwood OR "Phellinus")', mustMatch: [SPECIALTY_RE, VIETNAM_RE] },
      { lang: "ko", q: "베트남 (침향 OR 상황버섯 OR 침향환)", mustMatch: [SPECIALTY_RE, VIETNAM_RE] },
      // 논문 (PubMed): 침향·상황버섯 학명
      { lang: "en", source: "pubmed", q: 'agarwood OR Aquilaria OR "Phellinus linteus"' },
    ],
    focus: `Pick news about three specialty products sold to visitors in Nha Trang and Da Lat: agarwood (trầm hương, kỳ nam), Phellinus linteus mushroom (nấm thượng hoàng) and coffee. Ignore every other product.
The section is mainly about agarwood and the mushroom: include at most ONE coffee story in the top 10 (the most significant one), and fill the rest of the top 10 with agarwood and mushroom stories.
Rank by how widely discussed the story is (xN) and its impact: export deals and prices moving sharply, new rules and certification (geographical indications, food safety, quarantine, customs limits for travellers), counterfeit or fraud cases and crackdowns, harvest and cultivation news, big investments, anything involving Korean buyers or tourists, Khanh Hoa and Lam Dong stories.
News on these products is scarce, so also include research: Vietnamese press reports on studies, and lines from PubMed (journal articles, usually English titles). For research use only what the title states; do not claim health benefits beyond it. Prefer research done in Vietnam or with practical meaning (quality, authenticity testing, cultivation, safety). Keep at most 3 research items in the top 10.
Korean terms: always write trầm hương / agarwood as 침향 (never transliterate it as 트람흥 or 짬흐엉), kỳ nam as 기남침향, nấm thượng hoàng / Phellinus linteus as 상황버섯.
Skip routine daily price bulletins, advertisements and product promotions, and stories that only mention a product in passing.
For research items, set st to "연구 발표". When a headline has a price, export value, volume or percentage, put it in f.`,
    categories: "침향, 상황버섯, 커피",
  },
  // 나트랑 부동산: 장터 옆 별도 탭(/realestate). 매물이 아니라 뉴스다. 기사가 적은 분야라 지난 주 순위로 채운다. 주간 전용
  realestate: {
    label: "나트랑 부동산",
    weeklyOnly: true,
    carryOverWeeks: 4,
    queries: [
      {
        lang: "vi",
        q: '("Nha Trang" OR "Khánh Hòa" OR "Cam Ranh") ("bất động sản" OR "chung cư" OR "căn hộ" OR "nhà ở" OR "condotel" OR "biệt thự" OR "khu đô thị" OR "thuê nhà")',
        mustMatch: [NHATRANG_RE, PROPERTY_RE],
      },
      // 토지·인허가: 땅값표, 경매, 계획, 수용, 소유권 증서
      {
        lang: "vi",
        q: '("Nha Trang" OR "Khánh Hòa" OR "Cam Ranh") ("giá đất" OR "bảng giá đất" OR "đấu giá đất" OR "quy hoạch" OR "thu hồi đất" OR "sổ hồng" OR "sổ đỏ" OR "dự án")',
        mustMatch: [NHATRANG_RE, PROPERTY_RE],
      },
      {
        lang: "en",
        q: '("Nha Trang" OR "Khanh Hoa" OR "Cam Ranh") ("real estate" OR property OR condo OR apartment OR "land price" OR developer OR housing)',
        mustMatch: [NHATRANG_RE, PROPERTY_RE],
      },
      { lang: "ko", q: "(나트랑 OR 냐짱 OR 깜라인) (부동산 OR 아파트 OR 콘도 OR 분양 OR 레지던스 OR 투자)", mustMatch: [NHATRANG_RE, PROPERTY_RE] },
      // 전국 규정: 외국인 주택 구매·소유·임대 (나트랑 교민에게도 바로 적용된다)
      {
        lang: "vi",
        q: '"người nước ngoài" ("sở hữu nhà" OR "mua nhà" OR "mua chung cư" OR "thuê nhà" OR "nhà ở")',
        mustMatch: PROPERTY_RE,
      },
    ],
    focus: `Readers: Korean residents and visitors in Nha Trang who rent or think about buying property there.
Pick news about the property market in Nha Trang, Cam Ranh and Khanh Hoa province: new apartment, condotel, villa and urban-area projects (launches, approvals, delays, legal problems); sale and rental prices and transaction trends; land price tables, land auctions, planning and land recovery decisions; title certificates (sổ hồng) being issued or withheld; large resort and hotel developments that change the city; infrastructure that moves property values (roads, airport, coastal projects); developer troubles, fraud and court cases.
Also include nationwide rules on foreigners buying, owning or renting homes, because they apply directly in Nha Trang.
Rank by how much it matters to someone renting or buying there (price, legal safety, availability), then by how widely covered it is (xN). Prefer Khanh Hoa stories over national ones except foreign-ownership rules.
Skip general tourism and weather news, crime unrelated to property, and advertorials or project promotions that only praise a development. This is news, not investment advice: in tp, say what to check (legal status, title, contract terms), never recommend buying.
When a headline has a price per m², total price, area, number of units or a date, put it in f.`,
    categories: "개발·분양, 시세·거래, 토지·인허가, 외국인 규정, 임대, 리조트·호텔, 인프라, 분쟁·사기",
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

// 출력 토큰을 아끼려고 키 이름을 짧게 쓴다 (프롬프트에 뜻을 적어 둔다).
// 1~10위(top)와 11위 이하(rest)를 다른 목록으로 받는다: 한 목록에서 순위로 규칙을 나누면 모델이 1~10위 요약까지 비우는 일이 있었다
const TOP_ITEM = {
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
        properties: {
          l: { type: "string" },
          v: { type: "string" },
          src: { type: "string" },
          cur: { type: "string" },
        },
        required: ["l", "v", "src", "cur"],
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
};
const REST_ITEM = {
  type: "object",
  properties: { h: { type: "string" }, c: { type: "string" }, ids: { type: "array", items: { type: "integer" } } },
  required: ["h", "c", "ids"],
  additionalProperties: false,
};
const SCHEMA = {
  type: "object",
  properties: { top: { type: "array", items: TOP_ITEM }, rest: { type: "array", items: REST_ITEM } },
  required: ["top", "rest"],
  additionalProperties: false,
};

type TopItem = {
  h: string;
  sm: string;
  tp: string;
  c: string;
  st: string;
  f: { l: string; v: string; src: string; cur: string }[];
  tl: { i: number; e: string }[];
  ids: number[];
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
  const period: PeriodId = SCOPES[scope].weeklyOnly ? "week" : requested; // 해외생활·특산품은 주간만 있다
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
    filled.stories = applyTopCaps(filled.stories, SCOPES[scope].topCaps);
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
    // Railway 로그(Deployments → View logs)에서 원인을 볼 수 있게
    console.error(`[rankings] ${scope}:${period} 생성 실패: ${entry.error}`);
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

// AI가 지시를 어겨도 분류별 TOP 10 개수 제한을 지키도록 서버에서 다시 정렬한다 (예: 커피는 TOP 10 안에 1건)
export function applyTopCaps(stories: RankedStory[], caps?: Record<string, number>): RankedStory[] {
  if (!caps) return stories;
  const top: RankedStory[] = [];
  const pushedDown: RankedStory[] = [];
  const rest: RankedStory[] = [];
  const count: Record<string, number> = {};
  for (const s of stories) {
    if (top.length >= FREE_RANKS) {
      rest.push(s);
      continue;
    }
    const cap = caps[s.category];
    if (cap !== undefined && (count[s.category] ?? 0) >= cap) {
      pushedDown.push(s);
      continue;
    }
    count[s.category] = (count[s.category] ?? 0) + 1;
    top.push(s);
  }
  // 다른 항목이 모자라 TOP 10을 못 채우면, 내린 항목이 다시 10위 안에 들어오므로 아예 뺀다
  const below = top.length >= FREE_RANKS ? pushedDown : [];
  return [...top, ...below, ...rest].map((s, i) => ({ ...s, rank: i + 1 }));
}

// 모델이 음역해 버린 품목명을 바로잡는다 (Trầm hương → 침향)
const KO_FIXES: [RegExp, string][] = [[/트람\s?흐?엉|트람흥|짬\s?흐엉|쩜\s?흐엉|짬흥/g, "침향"]];
export function fixTerms(text: string) {
  return KO_FIXES.reduce((t, [re, to]) => t.replace(re, to), text);
}

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

Output: "top" = ranks 1-10 in order, every one fully written; "rest" = ranks 11 and below in order (headline only).
Keys: h headline, sm summary, tp talking point, c category, st status, f figures (l label, v value), tl timeline (i headline id, e event), ids headline ids.
Rules:
- Merge lines about the same event or ongoing development into one story. ids: up to 8 of its most relevant line ids.
- Write in Korean. h: one concise line. c: one of ${SCOPES[scope].categories ?? DEFAULT_CATEGORIES}.
- top (ranks 1-10). Never leave sm, tp or st empty here:
  - sm: 2 short, plain sentences on what happened and why it matters. tp: one plain sentence on what it means for Korean residents or visitors in Vietnam (or what to keep in mind).
  - st: current state in a few words (e.g. 협상 중, 타결, 시행 중, 진행 중, 종료, 피해 수습 중).
  - f: up to 3 key numbers. src: the number exactly as written in one of this story's headlines, digits and separators copied (e.g. "6,1 tấn", "46% xuống 20%", "1,2 tỷ USD"). v: the same number written the Korean way for Korean readers: "." as decimal point, "," for thousands, 만/억/조 for large counts, units translated (tấn→톤, người→명, ha→헥타르, dự án→개 사업, căn hộ→가구), e.g. "6.1톤", "1만 명", "46% → 20%". Use "before → after" only when both numbers appear. For money set cur to the ISO currency code (VND for đồng, USD, EUR, JPY, CNY, KRW…) and keep the amount with its unit word in src (e.g. "1,2 tỷ USD", "35.000 tỷ đồng"); the server writes the Korean money text itself. For non-money set cur "". Empty list if none.
  - tl: 2-4 key steps in order, each with the id of the line reporting it and a short description without dates.
- rest (ranks 11 and below): only h, c and ids.
- Use only facts present in the headlines. Do not invent numbers, dates or quotes.
- Order by significance, most important first. Return fewer stories if there are fewer real ones.`;

  const lines = clusters
    .map((c, i) => `${i}\t${yymmdd(c.date)}\t${c.members.length > 1 ? `x${c.members.length}` : ""}\t${c.title}`)
    .join("\n");
  const krwPer = await krwRates(); // 돈 수치의 원화 환산용 (실패하면 환산 생략)
  const client = new Anthropic();
  // AI의 검토(thinking) 토큰도 출력 요금이라, 짧은 기간은 낮은 강도로 충분하다 (주간·1년·3년은 중간)
  const ask = async (effort: "low" | "medium") => {
    // 출력이 길 수 있어 스트리밍으로 받는다 (HTTP 타임아웃 방지)
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort, format: { type: "json_schema", schema: SCHEMA } },
        system,
        messages: [{ role: "user", content: lines }],
      })
      .finalMessage();
    if (response.stop_reason === "refusal") throw new Error("요청이 거절됨");
    if (response.stop_reason === "max_tokens") throw new Error("응답이 잘림 (max_tokens)");
    const usage = recordUsage(response.usage.input_tokens, response.usage.output_tokens);
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = JSON.parse(text) as { top: TopItem[]; rest: { h: string; c: string; ids: number[] }[] };
    // 1~10위 중 요약이 빈 항목 수
    const blank = parsed.top.slice(0, FREE_RANKS).filter((t) => !t.sm?.trim()).length;
    return { parsed, usage, blank };
  };

  let effort: "low" | "medium" = period === "day" || period === "month" ? "low" : "medium";
  let { parsed, usage, blank } = await ask(effort);
  // 1~10위 요약이 절반 넘게 비었으면 한 번만 더 (강도를 올려) 받는다
  if (blank > Math.min(parsed.top.length, FREE_RANKS) / 2) {
    console.warn(`[rankings] ${scope}:${period} 요약 빈 항목 ${blank}개 → 다시 요청`);
    effort = "medium";
    const retry = await ask(effort);
    usage = addUsage(usage, retry.usage) ?? usage;
    if (retry.blank < blank) ({ parsed, blank } = retry);
  }
  const items: TopItem[] = [
    ...parsed.top,
    ...parsed.rest.map((r) => ({ ...r, sm: "", tp: "", st: "", f: [], tl: [] })),
  ];

  const validId = (id: number) => Number.isInteger(id) && id >= 0 && id < clusters.length;

  const stories: RankedStory[] = items.slice(0, MAX_STORIES).map((s, i) => {
    // 모델이 준 id 중 실제로 있는 줄만 근거로 남기고, 묶여 있던 기사까지 펼친다
    const ids = [...new Set(s.ids)].filter(validId);
    const allArticles = ids.flatMap((id) => clusters[id].members).sort((a, b) => a.publishedAt - b.publishedAt);
    const sourceText = allArticles.map((a) => a.title).join(" \n ");

    // 수치는 근거 기사 제목에 그 숫자(src)가 실제로 있을 때만 남긴다 (지어낸 숫자 차단).
    // 돈은 서버가 src를 직접 읽어 "원문 통화 (약 원화)"로 적고, 그 밖의 수는 한국식 표기(v)가 src와 같은 수일 때만 쓴다.
    // 어느 쪽도 맞지 않으면 그 수치는 뺀다 (베트남어 원문이 그대로 보이지 않게)
    const figures = (s.f ?? [])
      .filter((f) => f.src && numbersAppearIn(f.src, sourceText))
      .map((f) => {
        if (f.cur) {
          const amount = parseAmount(f.src);
          const money = amount ? formatMoney(amount, f.cur.toUpperCase(), krwPer) : null;
          return money ? { label: f.l, value: money } : null;
        }
        return f.v && significantDigits(f.v) === significantDigits(f.src) ? { label: f.l, value: f.v } : null;
      })
      .filter((f): f is { label: string; value: string } => f !== null)
      .slice(0, 3);

    // 타임라인 날짜는 모델이 쓴 날짜가 아니라 그 줄 기사의 발행일을 쓴다
    const seenIds = new Set<number>();
    const timeline = (s.tl ?? [])
      .filter((t) => validId(t.i) && !seenIds.has(t.i) && seenIds.add(t.i))
      .filter((t) => numbersAppearIn(t.e, clusters[t.i].members.map((m) => m.title).join(" \n ")))
      .map((t) => ({ date: clusters[t.i].date, event: fixTerms(t.e) }))
      .sort((a, b) => a.date - b.date)
      .slice(0, 5);
    return {
      rank: i + 1,
      headline: fixTerms(s.h),
      summary: fixTerms(s.sm),
      talkingPoint: fixTerms(s.tp),
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
