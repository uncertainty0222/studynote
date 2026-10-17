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
  // 지정 시 링크가 이 정규식에 맞는 기사는 버린다 (베트남과 무관한 섹션 제외용)
  excludeLink?: RegExp;
  // money: 금융·코인·부동산 전용 소스. 이 소스의 기사는 일반 목록에 섞지 않고 '돈 이야기' 탭에만 보인다
  section?: "money";
  // 기본 7일보다 오래된 기사까지 받을 때 (월간 탑10용)
  maxAgeDays?: number;
};

type GnEdition = "en" | "ko" | "vi";

const GN_EDITION: Record<GnEdition, string> = {
  en: "hl=en-US&gl=US&ceid=US:en",
  ko: "hl=ko&gl=KR&ceid=KR:ko",
  vi: "hl=vi&gl=VN&ceid=VN:vi",
};

export function googleNews(query: string, edition: GnEdition) {
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
    // 국제(World) 섹션은 베트남과 무관한 해외 기사라 제외
    excludeLink: /\/news\/world\//,
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
    id: "intl-vietnam-world",
    name: "해외 언론: 국제정세 속 베트남",
    region: "intl",
    lang: "en",
    url: googleNews(
      'Vietnam (China OR "United States" OR Trump OR ASEAN OR "South China Sea" OR tariff OR Russia OR Japan) when:7d',
      "en",
    ),
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
    id: "chaovietnam",
    name: "씬짜오베트남",
    region: "kr",
    lang: "ko",
    url: googleNews("site:chaovietnam.co.kr when:7d", "ko"),
  },
  {
    id: "insidevina",
    name: "인사이드비나",
    region: "kr",
    lang: "ko",
    url: googleNews("site:insidevina.com when:7d", "ko"),
  },

  // ── 금융·코인·부동산 (돈 이야기 탭 전용) ────────────
  {
    id: "money-crypto-vi",
    name: "베트남 암호화폐 (베트남어)",
    region: "vn",
    lang: "vi",
    url: googleNews("(\"tiền mã hóa\" OR \"tiền số\" OR \"tài sản số\" OR \"tài sản mã hóa\" OR bitcoin) when:7d", "vi"),
    section: "money",
  },
  {
    id: "money-crypto-en",
    name: "Vietnam crypto (영문)",
    region: "intl",
    lang: "en",
    url: googleNews("Vietnam (crypto OR bitcoin OR stablecoin OR \"digital assets\" OR \"virtual assets\") when:7d", "en"),
    section: "money",
  },
  {
    id: "money-finance-vi",
    name: "베트남 금융·증시 (베트남어)",
    region: "vn",
    lang: "vi",
    url: googleNews("(\"chứng khoán\" OR VN-Index OR \"lãi suất\" OR \"tỷ giá\" OR \"giá vàng\") when:2d", "vi"),
    section: "money",
  },
  {
    id: "money-realestate-vi",
    name: "베트남 부동산 (베트남어)",
    region: "vn",
    lang: "vi",
    url: googleNews("(\"bất động sản\" OR \"chung cư\" OR \"giá nhà\" OR \"căn hộ\") when:3d", "vi"),
    section: "money",
  },
  {
    id: "money-kr",
    name: "한국 언론 (베트남 돈 이야기)",
    region: "kr",
    lang: "ko",
    url: googleNews("베트남 (부동산 OR 증시 OR 코인 OR 가상자산 OR 금리 OR 환율 OR 아파트) when:7d", "ko"),
    section: "money",
  },
];

export const REGION_LABEL: Record<Region, string> = {
  vn: "베트남 언론",
  intl: "해외 언론",
  kr: "한국 언론",
};
