// 회원·결제 저장소 (Postgres). Railway에서 Postgres를 추가하면 DATABASE_URL이 생긴다.
// DATABASE_URL이 없으면 로그인·결제 기능은 꺼지고, 나머지(뉴스 순위·이용권 코드)는 그대로 동작한다.

import { Pool } from "pg";

const G = globalThis as unknown as { __vnDb?: { pool: Pool; ready: Promise<void> } };

export function dbEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

const SCHEMA = `
create table if not exists members (
  kakao_id bigint primary key,
  nickname text not null default '',
  premium_until timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);
create table if not exists payment_requests (
  id serial primary key,
  kakao_id bigint not null references members(kakao_id),
  payer_name text not null default '',
  status text not null default 'pending', -- pending | approved | rejected
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists payment_requests_status on payment_requests(status, created_at);
-- 승인 후 회원이 사이트에서 '멤버십이 열렸어요' 안내를 봤는지
alter table payment_requests add column if not exists seen boolean not null default false;
-- 사이트 안에서 보여 주는 무작위 별명과 프로필 그림 (lib/profile.ts)
alter table members add column if not exists alias text;
alter table members add column if not exists avatar text;
create unique index if not exists members_alias on members(alias);
-- 한국 → 나트랑 항공권 날짜별 최저가 (lib/flights.ts)
create table if not exists flight_prices (
  day date not null,
  origin text not null,
  price integer not null,
  primary key (day, origin)
);
`;

function db() {
  if (!G.__vnDb) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Railway 내부 주소는 SSL 없이, 외부(public) 주소로 붙을 때만 PGSSL=1
      ssl: process.env.PGSSL === "1" ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
    G.__vnDb = { pool, ready: pool.query(SCHEMA).then(() => undefined) };
    // 첫 연결이 실패하면 다음 요청에서 다시 시도한다
    G.__vnDb.ready.catch(() => {
      G.__vnDb = undefined;
      pool.end().catch(() => {});
    });
  }
  return G.__vnDb;
}

export async function query<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
  const { pool, ready } = db();
  await ready;
  return (await pool.query<T>(text, params)).rows;
}
