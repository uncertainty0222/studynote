// 한국 → 나트랑(깜라인 CXR) 편도 최저가와 최근 7일 추이.
// 재료: Travelpayouts(Aviasales) Data API의 /aviasales/v3/prices_for_dates.
//  - 실시간 판매가가 아니라 Aviasales 이용자가 최근(약 48시간) 검색한 결과의 캐시라 실제 가격과 다를 수 있다.
//  - TRAVELPAYOUTS_TOKEN이 없으면 카드가 보이지 않는다.
// 추이: 6시간마다 받아 온 최저가를 날짜별 최저값으로 저장한다(DATABASE_URL이 있으면 DB, 없으면 서버 메모리).
//  서버를 처음 켠 날부터 쌓이므로 처음 며칠은 점이 적다.

import { dbEnabled, query } from "./db";

export type FlightQuote = { price: number; departureAt: string; airline: string; transfers: number; link: string | null };
export type FlightRoute = { origin: string; label: string; best: FlightQuote | null; history: { day: string; price: number }[] };
export type FlightCard = { enabled: boolean; updatedAt: number | null; routes: FlightRoute[] };

const DESTINATION = "CXR"; // 깜라인 국제공항 (나트랑)
const ORIGINS = [
  { origin: "SEL", label: "서울" }, // 인천·김포를 묶은 도시 코드
  { origin: "PUS", label: "부산" },
];
const REFRESH_MS = 6 * 3600_000;
const ICT_OFFSET_MS = 7 * 3600_000;

type Raw = {
  price?: number;
  departure_at?: string;
  airline?: string;
  transfers?: number;
  link?: string;
};

const G = globalThis as unknown as {
  __vnFlights?: { card: FlightCard | null; fetchedAt: number; running: Promise<void> | null; memHistory: Map<string, number> };
};
const state = (G.__vnFlights ??= { card: null, fetchedAt: 0, running: null, memHistory: new Map() });

export function flightsEnabled() {
  return Boolean(process.env.TRAVELPAYOUTS_TOKEN);
}

// 캐시된 카드를 돌려주고, 오래됐으면 새로 받는다 (처음 한 번은 받아 올 때까지 기다린다)
export async function getFlightCard(): Promise<FlightCard> {
  if (!flightsEnabled()) return { enabled: false, updatedAt: null, routes: [] };
  if (Date.now() - state.fetchedAt > REFRESH_MS && !state.running) {
    state.running = refresh().finally(() => {
      state.running = null;
    });
  }
  if (!state.card && state.running) await state.running;
  return state.card ?? { enabled: true, updatedAt: null, routes: [] };
}

async function refresh() {
  const routes: FlightRoute[] = [];
  for (const o of ORIGINS) {
    const best = await cheapest(o.origin).catch((e) => {
      console.error("[flights]", o.origin, e);
      return null;
    });
    if (best) await recordDaily(o.origin, best.price).catch((e) => console.error("[flights] history", e));
    routes.push({ origin: o.origin, label: o.label, best, history: await history(o.origin).catch(() => []) });
  }
  state.card = { enabled: true, updatedAt: Date.now(), routes };
  state.fetchedAt = Date.now();
}

// 이번 달과 다음 달 출발 편도 중 가장 싼 표 (이미 지난 날짜는 뺀다)
async function cheapest(origin: string): Promise<FlightQuote | null> {
  const now = new Date();
  const months = [0, 1].map((k) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
    return d.toISOString().slice(0, 7);
  });
  let best: Raw | null = null;
  for (const month of months) {
    const p = new URLSearchParams({
      origin,
      destination: DESTINATION,
      departure_at: month,
      one_way: "true",
      sorting: "price",
      currency: "krw",
      limit: "30",
    });
    const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${p}`, {
      headers: { "X-Access-Token": process.env.TRAVELPAYOUTS_TOKEN ?? "", "Accept-Encoding": "gzip, deflate" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Raw[]; error?: string };
    if (!res.ok || body.success === false) throw new Error(`HTTP ${res.status} ${body.error ?? ""}`);
    for (const r of body.data ?? []) {
      if (typeof r.price !== "number" || !r.departure_at) continue;
      if (Date.parse(r.departure_at) < Date.now()) continue;
      if (!best || r.price < best.price!) best = r;
    }
  }
  if (!best) return null;
  return {
    price: best.price!,
    departureAt: best.departure_at!,
    airline: best.airline ?? "",
    transfers: best.transfers ?? 0,
    link: best.link ? `https://www.aviasales.com${best.link.startsWith("/") ? "" : "/"}${best.link}` : null,
  };
}

function today() {
  return new Date(Date.now() + ICT_OFFSET_MS).toISOString().slice(0, 10);
}

// 날짜별(베트남 시간) 최저값만 남긴다
async function recordDaily(origin: string, price: number) {
  const day = today();
  if (dbEnabled()) {
    await query(
      `insert into flight_prices (day, origin, price) values ($1, $2, $3)
       on conflict (day, origin) do update set price = least(flight_prices.price, excluded.price)`,
      [day, origin, price],
    );
    return;
  }
  const key = `${origin}:${day}`;
  const prev = state.memHistory.get(key);
  state.memHistory.set(key, prev === undefined ? price : Math.min(prev, price));
}

async function history(origin: string): Promise<{ day: string; price: number }[]> {
  const from = new Date(Date.now() + ICT_OFFSET_MS - 6 * 86400_000).toISOString().slice(0, 10);
  if (dbEnabled()) {
    const rows = await query<{ day: string; price: number }>(
      `select to_char(day, 'YYYY-MM-DD') as day, price from flight_prices where origin = $1 and day >= $2 order by day`,
      [origin, from],
    );
    return rows.map((r) => ({ day: r.day, price: Number(r.price) }));
  }
  return [...state.memHistory.entries()]
    .filter(([k]) => k.startsWith(`${origin}:`) && k.slice(origin.length + 1) >= from)
    .map(([k, price]) => ({ day: k.slice(origin.length + 1), price }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
