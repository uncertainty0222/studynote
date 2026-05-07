import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

let _sql: Sql | null = null;
let _initialized = false;
let _initPromise: Promise<void> | null = null;

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

function getSql(): Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경 변수가 필요합니다");
  _sql = postgres(url, {
    ssl: process.env.NODE_ENV === "production" ? "require" : false,
    max: 5,
  });
  return _sql;
}

export async function initDb(): Promise<void> {
  if (_initialized) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const sql = getSql();

    await sql`
      CREATE TABLE IF NOT EXISTS news_articles (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT,
        url TEXT UNIQUE NOT NULL,
        source TEXT NOT NULL,
        published_at TIMESTAMPTZ,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_new BOOLEAN NOT NULL DEFAULT TRUE
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        subscription TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `;

    _initialized = true;
  })();

  return _initPromise;
}

// ── News ──────────────────────────────────────────────────

export interface NewsArticle {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  published_at: string | null;
  fetched_at: string;
  is_new: boolean;
}

export async function getNewsArticles(): Promise<NewsArticle[]> {
  await initDb();
  const sql = getSql();
  return sql<NewsArticle[]>`
    SELECT * FROM news_articles ORDER BY fetched_at DESC LIMIT 50
  `;
}

export async function upsertNewsArticle(article: {
  title: string;
  summary: string | null;
  url: string;
  source: string;
  published_at: Date | null;
}): Promise<boolean> {
  await initDb();
  const sql = getSql();
  const result = await sql`
    INSERT INTO news_articles (title, summary, url, source, published_at)
    VALUES (${article.title}, ${article.summary}, ${article.url}, ${article.source}, ${article.published_at})
    ON CONFLICT (url) DO NOTHING
  `;
  return result.count > 0;
}

export async function markAllRead(): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`UPDATE news_articles SET is_new = FALSE`;
}

export async function getNewArticleCount(): Promise<number> {
  await initDb();
  const sql = getSql();
  const [row] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM news_articles WHERE is_new = TRUE
  `;
  return row.count;
}

// ── Push Subscriptions ────────────────────────────────────

export async function upsertPushSubscription(endpoint: string, subscription: Record<string, unknown>): Promise<void> {
  await initDb();
  const sql = getSql();
  const subJson = JSON.stringify(subscription);
  await sql`
    INSERT INTO push_subscriptions (endpoint, subscription)
    VALUES (${endpoint}, ${subJson})
    ON CONFLICT (endpoint) DO UPDATE SET subscription = ${subJson}
  `;
}

export async function getAllPushSubscriptions(): Promise<{ endpoint: string; subscription: string }[]> {
  await initDb();
  const sql = getSql();
  return sql<{ endpoint: string; subscription: string }[]>`
    SELECT endpoint, subscription::text AS subscription FROM push_subscriptions
  `;
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

// ── Config ────────────────────────────────────────────────

export async function getConfigValue(key: string): Promise<string | null> {
  await initDb();
  const sql = getSql();
  const rows = await sql<{ value: string }[]>`SELECT value FROM config WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`
    INSERT INTO config (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = ${value}
  `;
}
