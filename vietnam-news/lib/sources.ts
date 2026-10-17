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

// 제목·요약에 베트남(나라·주요 도시·성·대표 기업·지도자)이 등장하는지.
// 교민 매체나 '한국' 검색처럼 베트남과 무관한 기사가 섞이는 소스에 mustMatch로 건다.
export const VIETNAM_RE = new RegExp(
  [
    "vietnam", "viet nam", "việt nam", "người việt", "베트남", "越南",
    "hanoi", "ha noi", "hà nội", "하노이",
    "ho chi minh", "hồ chí minh", "hcmc", "tp\\.hcm", "saigon", "sài gòn", "호찌민", "호치민", "사이공",
    "da nang", "danang", "đà nẵng", "다낭",
    "nha trang", "나트랑", "냐짱", "khanh hoa", "khánh hòa", "카인호아",
    "phu quoc", "phú quốc", "푸꾸옥",
    "hai phong", "hải phòng", "하이퐁",
    "ha long", "hạ long", "하롱", "quang ninh", "quảng ninh", "꽝닌",
    "hoi an", "hội an", "호이안", "da lat", "dalat", "đà lạt", "달랏", "huế", "후에",
    "can tho", "cần thơ", "껀터", "mekong", "메콩",
    "bac ninh", "bắc ninh", "박닌", "binh duong", "bình dương", "빈증", "dong nai", "đồng nai", "동나이",
    "vung tau", "vũng tàu", "붕따우", "long thanh", "long thành", "롱탄", "sapa", "sa pa", "사파",
    "vinfast", "vingroup", "viettel", "vietjet", "vietnam airlines", "petrovietnam",
    "to lam", "tô lâm", "또 럼", "또럼", "pham minh chinh", "phạm minh chính", "팜 민 찐", "팜민찐",
  ].join("|"),
  "i",
);

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
    mustMatch: VIETNAM_RE,
  },

  // ── 해외 언론 ─────────────────────────────
  {
    id: "intl-vietnam",
    name: "Reuters · AP · BBC · Nikkei 등",
    region: "intl",
    lang: "en",
    url: googleNews(`Vietnam (${INTL_SITES}) when:7d`, "en"),
    mustMatch: VIETNAM_RE,
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
    mustMatch: VIETNAM_RE,
  },
  {
    id: "intl-vietnam-korea",
    name: "해외 언론: 베트남-한국",
    region: "intl",
    lang: "en",
    url: googleNews("Vietnam \"South Korea\" OR Korean when:7d", "en"),
    mustMatch: VIETNAM_RE,
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
    mustMatch: VIETNAM_RE,
  },
  {
    id: "kr-vietnam-travel",
    name: "한국 언론 (베트남 여행·교민)",
    region: "kr",
    lang: "ko",
    url: googleNews("베트남 (관광객 OR 한국인 OR 교민 OR 다낭 OR 나트랑 OR 푸꾸옥 OR 하노이 OR 호찌민) when:7d", "ko"),
    mustMatch: VIETNAM_RE,
  },
  {
    id: "chaovietnam",
    name: "씬짜오베트남",
    region: "kr",
    lang: "ko",
    url: googleNews("site:chaovietnam.co.kr when:7d", "ko"),
    mustMatch: VIETNAM_RE,
  },
  {
    id: "insidevina",
    name: "인사이드비나",
    region: "kr",
    lang: "ko",
    url: googleNews("site:insidevina.com when:7d", "ko"),
    mustMatch: VIETNAM_RE,
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
    mustMatch: VIETNAM_RE,
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
    mustMatch: VIETNAM_RE,
  },
];

export const REGION_LABEL: Record<Region, string> = {
  vn: "베트남 언론",
  intl: "해외 언론",
  kr: "한국 언론",
};
