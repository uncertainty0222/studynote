// 제목·요약 키워드 기반 분류. 한국어/영어/베트남어 키워드를 함께 본다.
// 키워드 매칭이므로 오분류가 있을 수 있다.

export type TopicId =
  | "world"
  | "politics"
  | "economy"
  | "travel"
  | "society"
  | "culture"
  | "disaster"
  | "transport"
  | "crypto"
  | "finance"
  | "realestate";

export const TOPICS: { id: TopicId; label: string; re: RegExp }[] = [
  {
    id: "world",
    label: "국제정세",
    re: /미국|중국|트럼프|시진핑|러시아|일본|아세안|ASEAN|남중국해|유럽연합|무역협정|상호관세|united states|\bu\.s\.|\bus-|washington|china|chinese|beijing|trump|xi jinping|russia|japan|\beu\b|european union|south china sea|east sea|trade deal|trade war|reciprocal tariff|geopolit|apec|g20|hoa kỳ|nước mỹ|tổng thống mỹ|với mỹ|của mỹ|trung quốc|\bnga\b|nhật bản|biển đông|liên minh châu âu/i,
  },
  {
    id: "politics",
    label: "정치·외교",
    re: /정상회담|외교|총리|주석|서기장|대통령|국회|공산당|정부|장관|대사|minister|president|party chief|general secretary|politburo|diplomat|summit|national assembly|government|sanction|tariff|thủ tướng|chủ tịch|tổng bí thư|quốc hội|ngoại giao|bộ trưởng/i,
  },
  {
    id: "economy",
    label: "경제·투자",
    re: /경제|투자|수출|수입|무역|관세|환율|증시|주가|기업|공장|GDP|성장률|economy|economic|investment|investor|export|import|trade|gdp|stock|vn-index|inflation|factory|\bbank|real estate|kinh tế|đầu tư|xuất khẩu|nhập khẩu|chứng khoán|ngân hàng|bất động sản/i,
  },
  {
    id: "travel",
    label: "관광·여행",
    re: /관광|여행|항공|비자|입국|호텔|리조트|골프|다낭|나트랑|푸꾸옥|하롱|달랏|tourism|tourist|travel|visa|airline|airport|flight|hotel|resort|beach|du lịch|du khách|khách sạn|sân bay|hàng không|thị thực/i,
  },
  {
    id: "society",
    label: "사회·사건",
    re: /사건|사고|체포|경찰|범죄|사기|마약|재판|사망|부상|화재|arrest|police|crime|scam|fraud|drug|court|\btrial\b(?! operation)|sentenced|killed|\bdead\b|injured|\bfire\b|bị bắt|bắt giữ|công an|lừa đảo|ma túy|xét xử|tử vong|hỏa hoạn|vụ cháy/i,
  },
  {
    id: "culture",
    label: "문화·연예·음식",
    re: /문화|축제|공연|콘서트|영화|드라마|가수|배우|연예|한류|K팝|케이팝|음식|맛집|쌀국수|반미|커피|아시안게임|축구|festival|culture|concert|\bmovie|\bfilms?\b|\bsinger|\bactors?\b|\bactress|showbiz|k-pop|food|cuisine|culinary|\bpho\b|banh mi|coffee|football|lễ hội|văn hóa|ca sĩ|diễn viên|phim|showbiz|ẩm thực|món ăn|bóng đá|hoa hậu/i,
  },
  {
    id: "disaster",
    label: "날씨·재해",
    re: /태풍|홍수|폭우|산사태|폭염|지진|날씨|typhoon|storm|flood|landslide|heatwave|heat wave|earthquake|weather|\brain|\bbão|lũ lụt|lũ quét|mưa lớn|sạt lở|nắng nóng|thời tiết/i,
  },
  {
    id: "transport",
    label: "교통·인프라",
    re: /고속도로|철도|지하철|메트로|공항 건설|교통|도로|highway|expressway|railway|metro|high-speed|infrastructure|traffic|bridge|cao tốc|đường sắt|giao thông|tàu điện/i,
  },
  // ── 돈 이야기 (별도 탭) ──
  {
    id: "crypto",
    label: "암호화폐",
    re: /암호화폐|가상자산|가상화폐|코인|비트코인|이더리움|스테이블코인|블록체인|crypto|bitcoin|\bbtc\b|ethereum|stablecoin|blockchain|digital asset|virtual asset|binance|tiền mã hóa|tiền số|tiền ảo|tài sản số|tài sản mã hóa|chuỗi khối/i,
  },
  {
    id: "finance",
    label: "금융·증시",
    re: /증시|주식|주가|VN지수|금리|환율|은행|채권|금값|금 가격|중앙은행|증권|stock market|vn-index|vnindex|securities|interest rate|exchange rate|central bank|state bank|\bbank|bond|gold price|inflation|ipo|chứng khoán|lãi suất|tỷ giá|ngân hàng|trái phiếu|giá vàng|cổ phiếu|lạm phát/i,
  },
  {
    id: "realestate",
    label: "부동산",
    re: /부동산|아파트|집값|분양|토지|real estate|property|apartment|condo|housing|land price|home price|bất động sản|chung cư|nhà ở|giá nhà|đất nền|căn hộ|sốt đất/i,
  },
];

// 금융·코인·부동산 탭에 모을 주제
export const MONEY_TOPICS: TopicId[] = ["crypto", "finance", "realestate"];

// 한국 관련 여부
export const KOREA_RE =
  /korea|korean|seoul|samsung|hyundai|\bLG\b|\bkia\b|lotte|\bCJ\b|posco|k-pop|hàn quốc|người hàn|한국|한-베|한베|韓|삼성|현대차|현대자동차|현대건설|HD현대|엘지|롯데|서울|교민|한국인|코트라|KOTRA/i;

// 한국인 관광객이 관심 가질 만한 곳·일 (주요 관광지, 입국·항공, 관광객 안전·물가)
export const KOREAN_INTEREST_RE =
  /다낭|나트랑|냐짱|푸꾸옥|하롱|호이안|달랏|사파|무이네|비자|입국|무비자|항공|관광객|da nang|danang|nha trang|phu quoc|ha long|hoi an|dalat|da lat|sapa|sa pa|mui ne|visa|entry|airport|flight|tourist|foreign visitors|đà nẵng|phú quốc|hạ long|hội an|đà lạt|sa pa|thị thực|miễn thị thực|du khách|khách quốc tế|sân bay/i;

// 가이드가 손님에게 꺼낼 만한 이야깃거리 (국제정세·문화·관광 또는 한국 관련)
export const TALK_TOPICS: TopicId[] = ["world", "culture", "travel"];

// AI 점수가 없을 때 쓰는 키워드 기반 흥미도 (1~10).
// 가중치: 한국 관련 > 국제정세 속 베트남 > 한국인 관심사(관광지·입국·안전) > 그 외. 한국과 무관한 지역 사건사고는 낮춘다.
export function keywordInterest(text: string, topics: TopicId[], korea: boolean, foreignPress: boolean): number {
  const koreanInterest = KOREAN_INTEREST_RE.test(text);
  let score = 2;
  if (korea) score += 4;
  if (topics.includes("world")) score += 3;
  if (koreanInterest) score += 2;
  if (topics.includes("disaster")) score += 2;
  if (topics.some((t) => t === "politics" || t === "economy" || t === "culture")) score += 1;
  if (foreignPress) score += 1; // 해외 언론이 다룰 정도면 국제적 의미가 있다
  if (topics.includes("society") && !korea && !koreanInterest) score -= 1;
  return Math.min(10, Math.max(1, score));
}

export function classify(text: string): { topics: TopicId[]; korea: boolean } {
  const topics = TOPICS.filter((t) => t.re.test(text)).map((t) => t.id);
  return { topics, korea: KOREA_RE.test(text) };
}
