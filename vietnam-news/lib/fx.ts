// 핵심 수치를 한국식으로 적기 위한 도구: 큰 수의 만·억·조 표기, 통화 이름, 원화 환산.
// 환율: ExchangeRate-API 공개 주소(키 없음, 하루 한 번 갱신). 받지 못하면 원화 환산을 생략한다.

const G = globalThis as unknown as { __vnFx?: { krwPer: Record<string, number>; fetchedAt: number } };
const FX_REFRESH_MS = 12 * 3600_000;

export const CURRENCY_NAMES: Record<string, string> = {
  VND: "동",
  USD: "달러",
  EUR: "유로",
  JPY: "엔",
  CNY: "위안",
  KRW: "원",
  THB: "바트",
  SGD: "싱가포르달러",
  AUD: "호주달러",
  GBP: "파운드",
};

// 통화 1단위가 몇 원인지. 실패하면 빈 객체
export async function krwRates(): Promise<Record<string, number>> {
  const cached = G.__vnFx;
  if (cached && Date.now() - cached.fetchedAt < FX_REFRESH_MS) return cached.krwPer;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/KRW", { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (!res.ok || body.result !== "success" || !body.rates) throw new Error(`HTTP ${res.status}`);
    // 응답은 1원 = x 외화. 뒤집어서 외화 1단위 = y원
    const krwPer: Record<string, number> = { KRW: 1 };
    for (const code of Object.keys(CURRENCY_NAMES)) {
      const r = body.rates[code];
      if (r && r > 0) krwPer[code] = 1 / r;
    }
    G.__vnFx = { krwPer, fetchedAt: Date.now() };
    return krwPer;
  } catch (e) {
    console.error("[fx]", e);
    return cached?.krwPer ?? {};
  }
}

const trim = (n: number, digits: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: digits });

// 1234567890 → "12억 3,457만"이 아니라 읽기 쉬운 어림: "12.3억", 35000000000000 → "35조", 1200000000000 → "1조 2,000억"
export function formatKo(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) {
    const jo = Math.floor(abs / 1e12);
    const eok = Math.round((abs - jo * 1e12) / 1e8);
    return `${sign}${trim(jo, 0)}조${eok ? ` ${trim(eok, 0)}억` : ""}`;
  }
  if (abs >= 1e8) return `${sign}${trim(abs / 1e8, abs < 1e9 ? 1 : 0)}억`;
  if (abs >= 1e4) return `${sign}${trim(abs / 1e4, abs < 1e5 ? 1 : 0)}만`;
  return `${sign}${trim(abs, 2)}`;
}

// 원문 통화 그대로 + 괄호 안에 대략 원화. 예: "12억 달러 (약 1조 6,600억 원)"
export function formatMoney(amount: number, currency: string, krwPer: Record<string, number>): string | null {
  const name = CURRENCY_NAMES[currency];
  if (!name || !(amount > 0)) return null;
  const main = `${formatKo(amount)} ${name}`;
  if (currency === "KRW") return main;
  const rate = krwPer[currency];
  if (!rate) return main;
  const krw = amount * rate;
  return `${main} (약 ${formatKo(krw)}${krw < 1e4 ? "원" : " 원"})`;
}

// 기사 제목에 적힌 금액을 숫자로: "1,2 tỷ USD" → 1200000000, "35.000 tỷ đồng" → 35000000000000, "$5 million" → 5000000.
// 베트남식(. 천 단위, , 소수점)과 영어식이 섞여 있어, 구분 기호 뒤가 정확히 세 자리면 천 단위로, 아니면 소수점으로 본다.
// 읽지 못하면 null (그 금액은 원화 환산 없이 빠진다)
export function parseAmount(src: string): number | null {
  const m = src.match(/(\d[\d.,]*)([\s\S]*)$/);
  if (!m) return null;
  let digits = m[1].replace(/[.,]$/, "");
  digits = digits.replace(/[.,](?=\d{3}(?!\d))/g, ""); // 천 단위 구분 기호
  digits = digits.replace(",", ".");
  const base = Number(digits);
  if (!Number.isFinite(base)) return null;
  const rest = m[2];
  if (/^\s*(nghìn tỷ|ngàn tỷ|trillion|tn\b|조)/i.test(rest)) return base * 1e12;
  if (/^\s*억/.test(rest)) return base * 1e8;
  if (/^\s*(tỷ|billion|bn\b|bil\b)/i.test(rest)) return base * 1e9;
  if (/^\s*(triệu|million|mn\b|mln\b|m\b)/i.test(rest)) return base * 1e6;
  if (/^\s*만/.test(rest)) return base * 1e4;
  if (/^\s*(nghìn|ngàn|thousand|k\b)/i.test(rest)) return base * 1e3;
  return base;
}

// 0과 숫자 아닌 글자를 지운 숫자열. "1,2 tỷ" ↔ 1200000000, "10.000 người" ↔ "1만 명" 처럼 표기만 다른 같은 수인지 대조할 때 쓴다
export function significantDigits(v: string | number): string {
  const s = typeof v === "number" ? String(Math.round(v * 100)) : v;
  return s.replace(/\D/g, "").replace(/0/g, "");
}
