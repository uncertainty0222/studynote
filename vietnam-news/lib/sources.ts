// 뉴스 소스 정의.
// region: vn = 베트남 언론, intl = 해외 언론, kr = 한국 언론
// 직접 RSS를 제공하는 곳은 직접 피드를, 그 외는 Google News RSS 검색(site: 연산자)으로 묶어서 가져온다.

export type Region = "vn" | "intl" | "kr";

export type Source = {
  id: string;
  name: string;
  region: Region;
  lang: "ko" | "en" | "vi";
  url: string;
  // 지정 시 제목/요약이 이 정규식에 맞는 기사만 남긴다 (베트남과 무관한 기사가 섞이는 피드용)
  mustMatch?: RegExp;
};

type GnEdition = "en" | "ko" | "vi";

const GN_EDITION: Record<GnEdition, string> = {
  en: "hl=en-US&gl=US&ceid=US:en",
  ko: "hl=ko&gl=KR&ceid=KR:ko",
  vi: "hl=vi&gl=VN&ceid=VN:vi",
};

function googleNews(query: string, edition: GnEdition) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${GN_EDITION[edition]}`;
}

const VIETNAM_RE = /vietnam|viet nam|hanoi|ha noi|ho chi minh|saigon|da nang|danang|nha trang|phu quoc|베트남|하노이|호찌민|호치민|다낭|나트랑|푸꾸옥/i;

const INTL_SITES = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bloomberg.com",
  "asia.nikkei.com",
  "scmp.com",
  "thediplomat.com",
  "aljazeera.com",
  "cnn.com",
  "nytimes.com",
  "theguardian.com",
]
  .map((s) => `site:${s}`)
  .join(" OR ");

export const SOURCES: Source[] = [
  // ── 베트남 언론 ─────────────────────────────
  {
    id: "vnexpress-intl",
    name: "VnExpress International",
    region: "vn",
    lang: "en",
    url: "https://e.vnexpress.net/rss/news.rss",
  },
  {
    id: "vnexpress",
    name: "VnExpress (베트남어)",
    region: "vn",
    lang: "vi",
    url: "https://vnexpress.net/rss/tin-moi-nhat.rss",
  },
  {
    id: "vn-english-press",
    name: "Tuoi Tre News · Vietnam News · VietnamPlus",
    region: "vn",
    lang: "en",
    url: googleNews("site:tuoitrenews.vn OR site:vietnamnews.vn OR site:vietnamplus.vn when:3d", "en"),
  },
  {
    id: "vn-press-korea",
    name: "베트남 언론의 한국 관련 보도",
    region: "vn",
    lang: "vi",
    url: googleNews("\"Hàn Quốc\" when:7d", "vi"),
  },

  // ── 해외 언론 ─────────────────────────────
  {
    id: "intl-vietnam",
    name: "Reuters · AP · BBC · Nikkei 등",
    region: "intl",
    lang: "en",
    url: googleNews(`Vietnam (${INTL_SITES}) when:7d`, "en"),
  },
  {
    id: "intl-vietnam-korea",
    name: "해외 언론: 베트남-한국",
    region: "intl",
    lang: "en",
    url: googleNews("Vietnam \"South Korea\" OR Korean when:7d", "en"),
  },
  {
    id: "bbc-asia",
    name: "BBC News Asia",
    region: "intl",
    lang: "en",
    url: "https://feeds.bbci.co.uk/news/world/asia/rss.xml",
    mustMatch: VIETNAM_RE,
  },

  // ── 한국 언론 ─────────────────────────────
  {
    id: "kr-vietnam",
    name: "한국 언론 (베트남)",
    region: "kr",
    lang: "ko",
    url: googleNews("베트남 when:3d", "ko"),
  },
  {
    id: "kr-vietnam-travel",
    name: "한국 언론 (베트남 여행·교민)",
    region: "kr",
    lang: "ko",
    url: googleNews("베트남 (관광객 OR 한국인 OR 교민 OR 다낭 OR 나트랑 OR 푸꾸옥 OR 하노이 OR 호찌민) when:7d", "ko"),
  },
  {
    id: "insidevina",
    name: "인사이드비나",
    region: "kr",
    lang: "ko",
    url: googleNews("site:insidevina.com when:7d", "ko"),
  },
];

export const REGION_LABEL: Record<Region, string> = {
  vn: "베트남 언론",
  intl: "해외 언론",
  kr: "한국 언론",
};
