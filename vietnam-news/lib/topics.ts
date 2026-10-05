// 제목·요약 키워드 기반 분류. 한국어/영어/베트남어 키워드를 함께 본다.
// 키워드 매칭이므로 오분류가 있을 수 있다.

export type TopicId = "politics" | "economy" | "travel" | "society" | "disaster" | "transport";

export const TOPICS: { id: TopicId; label: string; re: RegExp }[] = [
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
    re: /사건|사고|체포|경찰|범죄|사기|마약|재판|사망|부상|화재|arrest|police|crime|scam|fraud|drug|court|trial|sentenced|killed|\bdead\b|injured|\bfire\b|bị bắt|bắt giữ|công an|lừa đảo|ma túy|xét xử|tử vong|hỏa hoạn|vụ cháy/i,
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
];

// 한국 관련 여부
export const KOREA_RE =
  /korea|korean|seoul|samsung|hyundai|\bLG\b|\bkia\b|lotte|\bCJ\b|posco|k-pop|hàn quốc|người hàn|한국|한-베|한베|韓|삼성|현대차|현대자동차|현대건설|HD현대|엘지|롯데|서울|교민|한국인|코트라|KOTRA/i;

export function classify(text: string): { topics: TopicId[]; korea: boolean } {
  const topics = TOPICS.filter((t) => t.re.test(text)).map((t) => t.id);
  return { topics, korea: KOREA_RE.test(text) };
}
