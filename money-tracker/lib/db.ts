import postgres from 'postgres';
import bcrypt from 'bcryptjs';

type Sql = ReturnType<typeof postgres>;

let _sql: Sql | null = null;
let _initialized = false;
let _initPromise: Promise<void> | null = null;

function getSql(): Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 환경 변수가 필요합니다');
  _sql = postgres(url, {
    ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
    max: 10,
  });
  return _sql;
}

export async function initDb(): Promise<void> {
  if (_initialized) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const sql = getSql();

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        role TEXT NOT NULL CHECK(role IN ('husband', 'wife')),
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        payer TEXT NOT NULL CHECK(payer IN ('husband', 'wife')),
        amount INTEGER NOT NULL CHECK(amount > 0),
        memo TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        created_by TEXT NOT NULL DEFAULT 'husband' CHECK(created_by IN ('husband', 'wife')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS deletion_requests (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        requested_by TEXT NOT NULL CHECK(requested_by IN ('husband', 'wife')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS shopping_items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        added_by TEXT NOT NULL CHECK(added_by IN ('husband', 'wife')),
        status TEXT NOT NULL DEFAULT 'needed' CHECK(status IN ('needed', 'bought')),
        bought_by TEXT CHECK(bought_by IN ('husband', 'wife')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS shopping_comments (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES shopping_items(id) ON DELETE CASCADE,
        author TEXT NOT NULL CHECK(author IN ('husband', 'wife')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS personal_income (
        id SERIAL PRIMARY KEY,
        amount BIGINT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'VND',
        category TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS personal_expenses (
        id SERIAL PRIMARY KEY,
        amount BIGINT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'VND',
        category TEXT NOT NULL,
        merchant TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        receipt_image TEXT,
        items JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK(role IN ('husband', 'wife')),
        subscription TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // ─── Trading Bot Tables ───────────────────────────────────────────────────

    await sql`
      CREATE TABLE IF NOT EXISTS haxkai_tweets (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        media_urls TEXT[] DEFAULT '{}',
        processed BOOLEAN DEFAULT FALSE,
        fetched_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS ta_patterns (
        id SERIAL PRIMARY KEY,
        tweet_id TEXT REFERENCES haxkai_tweets(id),
        symbol TEXT,
        timeframe TEXT,
        pattern_type TEXT,
        indicators_used TEXT[] DEFAULT '{}',
        entry_logic JSONB,
        target_logic JSONB,
        stop_logic JSONB,
        risk_reward_ratio NUMERIC,
        confidence_score NUMERIC,
        raw_analysis JSONB,
        timing_context JSONB,
        timing_reasoning TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE ta_patterns ADD COLUMN IF NOT EXISTS timing_context JSONB
    `;
    await sql`
      ALTER TABLE ta_patterns ADD COLUMN IF NOT EXISTS timing_reasoning TEXT
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS style_profile (
        id SERIAL PRIMARY KEY,
        version INTEGER NOT NULL,
        profile_data JSONB NOT NULL,
        tweet_count INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS scan_results (
        id SERIAL PRIMARY KEY,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        detected_pattern TEXT,
        indicators_snapshot JSONB,
        style_match_score NUMERIC,
        entry_price NUMERIC,
        target_price NUMERIC,
        stop_price NUMERIC,
        risk_reward NUMERIC,
        scan_reasoning TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        scanned_at TIMESTAMPTZ DEFAULT NOW(),
        alerted_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS trade_log (
        id SERIAL PRIMARY KEY,
        scan_result_id INTEGER REFERENCES scan_results(id),
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        entry_price NUMERIC NOT NULL,
        quantity NUMERIC NOT NULL,
        target_price NUMERIC NOT NULL,
        stop_price NUMERIC NOT NULL,
        binance_order_id TEXT,
        binance_sl_order_id TEXT,
        binance_tp_order_id TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        pnl_usdt NUMERIC,
        reasoning TEXT NOT NULL,
        approved_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS risk_limits (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        daily_loss_usdt NUMERIC DEFAULT 0,
        daily_pnl_usdt NUMERIC DEFAULT 0,
        trade_count INTEGER DEFAULT 0
      )
    `;

    // ─── Seed pre-configured accounts ─────────────────────────────────────────
    const [{ count }] = await sql<[{ count: number }]>`SELECT COUNT(*)::int AS count FROM users`;
    if (count === 0) {
      const pw = await bcrypt.hash('1', 10);
      await sql`INSERT INTO users (role, name, username, password_hash) VALUES ('husband', 'INHWA', 'INHWA', ${pw}) ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO users (role, name, username, password_hash) VALUES ('wife', 'NHI', 'NHI', ${pw}) ON CONFLICT DO NOTHING`;
    }

    _initialized = true;
  })();

  return _initPromise;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  role: 'husband' | 'wife';
  name: string;
  username: string;
  password_hash: string;
}

export interface Transaction {
  id: number;
  payer: 'husband' | 'wife';
  amount: number;
  memo: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  created_by: 'husband' | 'wife';
  created_at: string;
}

export interface DeletionRequest {
  id: number;
  transaction_id: number;
  requested_by: 'husband' | 'wife';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  payer?: 'husband' | 'wife';
  amount?: number;
  memo?: string;
  date?: string;
}

export interface Balance {
  husbandOwes: number;
  husbandTotal: number;
  wifeTotal: number;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getUserByUsername(username: string): Promise<User | null> {
  await initDb();
  const sql = getSql();
  const rows = await sql<User[]>`SELECT * FROM users WHERE username = ${username}`;
  return rows[0] ?? null;
}

export async function getUserById(id: number): Promise<User | null> {
  await initDb();
  const sql = getSql();
  const rows = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ?? null;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function createSession(userId: number): Promise<string> {
  await initDb();
  const sql = getSql();
  const token = crypto.randomUUID();
  await sql`INSERT INTO sessions (token, user_id) VALUES (${token}, ${userId})`;
  return token;
}

export async function getSessionUser(token: string): Promise<User | null> {
  await initDb();
  const sql = getSql();
  const rows = await sql<User[]>`
    SELECT users.* FROM sessions
    JOIN users ON sessions.user_id = users.id
    WHERE sessions.token = ${token}
  `;
  return rows[0] ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(): Promise<Transaction[]> {
  await initDb();
  const sql = getSql();
  return sql<Transaction[]>`
    SELECT * FROM transactions WHERE status != 'rejected'
    ORDER BY date DESC, created_at DESC
  `;
}

export async function getTransactionById(id: number): Promise<Transaction | null> {
  await initDb();
  const sql = getSql();
  const rows = await sql<Transaction[]>`SELECT * FROM transactions WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function createTransaction(data: {
  payer: 'husband' | 'wife';
  amount: number;
  memo: string;
  date: string;
  created_by: 'husband' | 'wife';
}): Promise<Transaction> {
  await initDb();
  const sql = getSql();
  const [row] = await sql<Transaction[]>`
    INSERT INTO transactions (payer, amount, memo, date, status, created_by)
    VALUES (${data.payer}, ${data.amount}, ${data.memo}, ${data.date}, 'pending', ${data.created_by})
    RETURNING *
  `;
  return row;
}

export async function approveTransaction(id: number): Promise<boolean> {
  await initDb();
  const sql = getSql();
  const result = await sql`
    UPDATE transactions SET status = 'approved' WHERE id = ${id} AND status = 'pending'
  `;
  return result.count > 0;
}

export async function rejectTransaction(id: number): Promise<boolean> {
  await initDb();
  const sql = getSql();
  const result = await sql`
    UPDATE transactions SET status = 'rejected' WHERE id = ${id} AND status = 'pending'
  `;
  return result.count > 0;
}

// ─── Deletion Requests ────────────────────────────────────────────────────────

export async function createDeletionRequest(transactionId: number, requestedBy: 'husband' | 'wife'): Promise<DeletionRequest> {
  await initDb();
  const sql = getSql();
  const existing = await sql<DeletionRequest[]>`
    SELECT * FROM deletion_requests WHERE transaction_id = ${transactionId} AND status = 'pending'
  `;
  if (existing[0]) return existing[0];

  const [row] = await sql<DeletionRequest[]>`
    INSERT INTO deletion_requests (transaction_id, requested_by)
    VALUES (${transactionId}, ${requestedBy})
    RETURNING *
  `;
  return row;
}

export async function getPendingDeletionRequests(): Promise<DeletionRequest[]> {
  await initDb();
  const sql = getSql();
  return sql<DeletionRequest[]>`
    SELECT dr.*, t.payer, t.amount, t.memo, t.date
    FROM deletion_requests dr
    JOIN transactions t ON dr.transaction_id = t.id
    WHERE dr.status = 'pending'
    ORDER BY dr.created_at DESC
  `;
}

export async function getDeletionRequestById(id: number): Promise<DeletionRequest | null> {
  await initDb();
  const sql = getSql();
  const rows = await sql<DeletionRequest[]>`SELECT * FROM deletion_requests WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function approveDeletion(id: number): Promise<boolean> {
  await initDb();
  const sql = getSql();
  const rows = await sql<DeletionRequest[]>`SELECT * FROM deletion_requests WHERE id = ${id}`;
  const req = rows[0];
  if (!req || req.status !== 'pending') return false;

  await sql`UPDATE deletion_requests SET status = 'approved' WHERE id = ${id}`;
  await sql`DELETE FROM transactions WHERE id = ${req.transaction_id}`;
  return true;
}

export async function rejectDeletion(id: number): Promise<boolean> {
  await initDb();
  const sql = getSql();
  const result = await sql`
    UPDATE deletion_requests SET status = 'rejected' WHERE id = ${id} AND status = 'pending'
  `;
  return result.count > 0;
}

// ─── Shopping ─────────────────────────────────────────────────────────────────

export interface ShoppingItem {
  id: number;
  name: string;
  added_by: 'husband' | 'wife';
  status: 'needed' | 'bought';
  bought_by: 'husband' | 'wife' | null;
  created_at: string;
  comment_count: number;
}

export interface ShoppingComment {
  id: number;
  item_id: number;
  author: 'husband' | 'wife';
  content: string;
  created_at: string;
}

export async function getShoppingItems(): Promise<ShoppingItem[]> {
  await initDb();
  const sql = getSql();
  return sql<ShoppingItem[]>`
    SELECT si.*, COUNT(sc.id)::int AS comment_count
    FROM shopping_items si
    LEFT JOIN shopping_comments sc ON sc.item_id = si.id
    GROUP BY si.id
    ORDER BY status DESC, si.created_at DESC
  `;
}

export async function createShoppingItem(name: string, addedBy: 'husband' | 'wife'): Promise<ShoppingItem> {
  await initDb();
  const sql = getSql();
  const [row] = await sql<ShoppingItem[]>`
    INSERT INTO shopping_items (name, added_by) VALUES (${name}, ${addedBy}) RETURNING *, 0 AS comment_count
  `;
  return row;
}

export async function toggleShoppingItem(id: number, buyerRole: 'husband' | 'wife'): Promise<ShoppingItem | null> {
  await initDb();
  const sql = getSql();
  const [current] = await sql<ShoppingItem[]>`SELECT * FROM shopping_items WHERE id = ${id}`;
  if (!current) return null;
  const newStatus = current.status === 'needed' ? 'bought' : 'needed';
  const boughtBy = newStatus === 'bought' ? buyerRole : null;
  const [row] = await sql<ShoppingItem[]>`
    UPDATE shopping_items SET status = ${newStatus}, bought_by = ${boughtBy}
    WHERE id = ${id} RETURNING *, 0 AS comment_count
  `;
  return row;
}

export async function deleteShoppingItem(id: number): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`DELETE FROM shopping_items WHERE id = ${id}`;
}

export async function getShoppingComments(itemId: number): Promise<ShoppingComment[]> {
  await initDb();
  const sql = getSql();
  return sql<ShoppingComment[]>`SELECT * FROM shopping_comments WHERE item_id = ${itemId} ORDER BY created_at ASC`;
}

export async function createShoppingComment(itemId: number, author: 'husband' | 'wife', content: string): Promise<ShoppingComment> {
  await initDb();
  const sql = getSql();
  const [row] = await sql<ShoppingComment[]>`
    INSERT INTO shopping_comments (item_id, author, content) VALUES (${itemId}, ${author}, ${content}) RETURNING *
  `;
  return row;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getConfigValue(key: string): Promise<string | null> {
  await initDb();
  const sql = getSql();
  const rows = await sql<{ value: string }[]>`SELECT value FROM config WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`INSERT INTO config (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = ${value}`;
}

// ─── Personal Finance ─────────────────────────────────────────────────────────

export interface PersonalIncome {
  id: number; amount: number; currency: string; category: string; description: string; date: string; created_at: string;
}
export interface PersonalExpense {
  id: number; amount: number; currency: string; category: string; merchant: string; description: string;
  date: string; receipt_image: string | null; items: { name: string; price: number }[] | null; created_at: string;
}

export async function getPersonalIncome(): Promise<PersonalIncome[]> {
  await initDb();
  const sql = getSql();
  return sql<PersonalIncome[]>`SELECT * FROM personal_income ORDER BY date DESC, created_at DESC`;
}
export async function createPersonalIncome(data: Omit<PersonalIncome, 'id' | 'created_at'>): Promise<PersonalIncome> {
  await initDb();
  const sql = getSql();
  const [row] = await sql<PersonalIncome[]>`
    INSERT INTO personal_income (amount, currency, category, description, date)
    VALUES (${data.amount}, ${data.currency}, ${data.category}, ${data.description}, ${data.date}) RETURNING *
  `;
  return row;
}
export async function deletePersonalIncome(id: number): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`DELETE FROM personal_income WHERE id = ${id}`;
}

export async function getPersonalExpenses(): Promise<PersonalExpense[]> {
  await initDb();
  const sql = getSql();
  return sql<PersonalExpense[]>`SELECT * FROM personal_expenses ORDER BY date DESC, created_at DESC`;
}
export async function createPersonalExpense(data: Omit<PersonalExpense, 'id' | 'created_at'>): Promise<PersonalExpense> {
  await initDb();
  const sql = getSql();
  const [row] = await sql<PersonalExpense[]>`
    INSERT INTO personal_expenses (amount, currency, category, merchant, description, date, receipt_image, items)
    VALUES (${data.amount}, ${data.currency}, ${data.category}, ${data.merchant}, ${data.description}, ${data.date},
            ${data.receipt_image ?? null}, ${data.items ? sql.json(data.items) : null}) RETURNING *
  `;
  return row;
}
export async function deletePersonalExpense(id: number): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`DELETE FROM personal_expenses WHERE id = ${id}`;
}

// ─── Push Subscriptions ───────────────────────────────────────────────────────

export async function upsertPushSubscription(role: 'husband' | 'wife', endpoint: string, subscription: string): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`
    INSERT INTO push_subscriptions (endpoint, role, subscription)
    VALUES (${endpoint}, ${role}, ${subscription})
    ON CONFLICT (endpoint) DO UPDATE SET role = ${role}, subscription = ${subscription}
  `;
}

export async function getPushSubscriptionsForRole(role: 'husband' | 'wife'): Promise<{ endpoint: string; subscription: string }[]> {
  await initDb();
  const sql = getSql();
  return sql<{ endpoint: string; subscription: string }[]>`
    SELECT endpoint, subscription FROM push_subscriptions WHERE role = ${role}
  `;
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export async function getBalance(): Promise<Balance> {
  await initDb();
  const sql = getSql();
  const rows = await sql<{ payer: string; total: number }[]>`
    SELECT payer, SUM(amount)::int AS total FROM transactions
    WHERE status = 'approved' GROUP BY payer
  `;
  const husbandTotal = rows.find(r => r.payer === 'husband')?.total ?? 0;
  const wifeTotal = rows.find(r => r.payer === 'wife')?.total ?? 0;
  return { husbandOwes: wifeTotal - husbandTotal, husbandTotal, wifeTotal };
}

export interface VaultData {
  usd: Record<string, number>;
  krw: Record<string, number>;
  vnd: Record<string, number>;
}

const DEFAULT_VAULT: VaultData = {
  usd: { '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0 },
  krw: { '50000': 0, '10000': 0, '5000': 0, '1000': 0 },
  vnd: { '500000': 0, '200000': 0, '100000': 0 },
};

export async function getVaultData(): Promise<VaultData> {
  await initDb();
  const sql = getSql();
  const rows = await sql<{ value: string }[]>`SELECT value FROM config WHERE key = 'vault_data'`;
  if (rows.length === 0) return DEFAULT_VAULT;
  try { return JSON.parse(rows[0].value) as VaultData; } catch { return DEFAULT_VAULT; }
}

export async function setVaultData(data: VaultData): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`INSERT INTO config (key, value) VALUES ('vault_data', ${JSON.stringify(data)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}

export async function getPendingCountForRole(role: 'husband' | 'wife'): Promise<number> {
  await initDb();
  const sql = getSql();
  const [a] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM transactions WHERE status = 'pending' AND created_by != ${role}
  `;
  const [b] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM deletion_requests WHERE status = 'pending' AND requested_by != ${role}
  `;
  return a.count + b.count;
}

// ─── Trading Bot Types ────────────────────────────────────────────────────────

export interface HaxkaiTweet {
  id: string;
  text: string;
  created_at: string;
  media_urls: string[];
  processed: boolean;
  fetched_at: string;
}

export interface TaPattern {
  id: number;
  tweet_id: string | null;
  symbol: string | null;
  timeframe: string | null;
  pattern_type: string | null;
  indicators_used: string[];
  entry_logic: Record<string, unknown> | null;
  target_logic: Record<string, unknown> | null;
  stop_logic: Record<string, unknown> | null;
  risk_reward_ratio: number | null;
  confidence_score: number | null;
  raw_analysis: Record<string, unknown> | null;
  timing_context: Record<string, unknown> | null;
  timing_reasoning: string | null;
  created_at: string;
}

export interface StyleProfile {
  id: number;
  version: number;
  profile_data: Record<string, unknown>;
  tweet_count: number;
  created_at: string;
}

export interface ScanResult {
  id: number;
  symbol: string;
  timeframe: string;
  detected_pattern: string | null;
  indicators_snapshot: Record<string, unknown> | null;
  style_match_score: number | null;
  entry_price: number | null;
  target_price: number | null;
  stop_price: number | null;
  risk_reward: number | null;
  scan_reasoning: string;
  status: 'pending' | 'alerted' | 'traded' | 'expired' | 'rejected';
  scanned_at: string;
  alerted_at: string | null;
  expires_at: string | null;
}

export interface TradeLog {
  id: number;
  scan_result_id: number | null;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  quantity: number;
  target_price: number;
  stop_price: number;
  binance_order_id: string | null;
  binance_sl_order_id: string | null;
  binance_tp_order_id: string | null;
  status: 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual';
  pnl_usdt: number | null;
  reasoning: string;
  approved_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface RiskLimits {
  id: number;
  date: string;
  daily_loss_usdt: number;
  daily_pnl_usdt: number;
  trade_count: number;
}

// ─── Trading Bot DB Helpers ───────────────────────────────────────────────────

export async function saveTweet(tweet: Omit<HaxkaiTweet, 'fetched_at'>): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`
    INSERT INTO haxkai_tweets (id, text, created_at, media_urls, processed)
    VALUES (${tweet.id}, ${tweet.text}, ${tweet.created_at}, ${sql.array(tweet.media_urls)}, ${tweet.processed})
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function getLatestTweetId(): Promise<string | null> {
  await initDb();
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`SELECT id FROM haxkai_tweets ORDER BY created_at DESC LIMIT 1`;
  return rows[0]?.id ?? null;
}

export async function getUnprocessedTweets(): Promise<HaxkaiTweet[]> {
  await initDb();
  const sql = getSql();
  return sql<HaxkaiTweet[]>`SELECT * FROM haxkai_tweets WHERE processed = FALSE ORDER BY created_at ASC`;
}

export async function markTweetProcessed(id: string): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`UPDATE haxkai_tweets SET processed = TRUE WHERE id = ${id}`;
}

export async function getTweets(limit = 50): Promise<HaxkaiTweet[]> {
  await initDb();
  const sql = getSql();
  return sql<HaxkaiTweet[]>`SELECT * FROM haxkai_tweets ORDER BY created_at DESC LIMIT ${limit}`;
}

export async function saveTaPattern(data: Omit<TaPattern, 'id' | 'created_at'>): Promise<TaPattern> {
  await initDb();
  const sql = getSql();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (v: unknown) => v != null ? sql.json(v as any) : null;
  const [row] = await sql<TaPattern[]>`
    INSERT INTO ta_patterns (tweet_id, symbol, timeframe, pattern_type, indicators_used,
      entry_logic, target_logic, stop_logic, risk_reward_ratio, confidence_score, raw_analysis,
      timing_context, timing_reasoning)
    VALUES (${data.tweet_id}, ${data.symbol}, ${data.timeframe}, ${data.pattern_type},
      ${sql.array(data.indicators_used)}, ${j(data.entry_logic)},
      ${j(data.target_logic)}, ${j(data.stop_logic)},
      ${data.risk_reward_ratio}, ${data.confidence_score}, ${j(data.raw_analysis)},
      ${j(data.timing_context)}, ${data.timing_reasoning ?? null})
    RETURNING *
  `;
  return row;
}

export async function getTaPatterns(limit = 100): Promise<TaPattern[]> {
  await initDb();
  const sql = getSql();
  return sql<TaPattern[]>`SELECT * FROM ta_patterns ORDER BY created_at DESC LIMIT ${limit}`;
}

export async function getUnprocessedTaPatternCount(): Promise<number> {
  await initDb();
  const sql = getSql();
  const [row] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM ta_patterns
    WHERE created_at > (SELECT COALESCE(MAX(created_at), '1970-01-01') FROM style_profile)
  `;
  return row.count;
}

export async function saveStyleProfile(data: Omit<StyleProfile, 'id' | 'created_at'>): Promise<StyleProfile> {
  await initDb();
  const sql = getSql();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [row] = await sql<StyleProfile[]>`
    INSERT INTO style_profile (version, profile_data, tweet_count)
    VALUES (${data.version}, ${sql.json(data.profile_data as any)}, ${data.tweet_count})
    RETURNING *
  `;
  return row;
}

export async function getLatestStyleProfile(): Promise<StyleProfile | null> {
  await initDb();
  const sql = getSql();
  const rows = await sql<StyleProfile[]>`SELECT * FROM style_profile ORDER BY version DESC LIMIT 1`;
  return rows[0] ?? null;
}

export async function saveScanResult(data: Omit<ScanResult, 'id' | 'scanned_at' | 'alerted_at'>): Promise<ScanResult> {
  await initDb();
  const sql = getSql();
  const [row] = await sql<ScanResult[]>`
    INSERT INTO scan_results (symbol, timeframe, detected_pattern, indicators_snapshot,
      style_match_score, entry_price, target_price, stop_price, risk_reward, scan_reasoning, status, expires_at)
    VALUES (${data.symbol}, ${data.timeframe}, ${data.detected_pattern},
      ${data.indicators_snapshot ? sql.json(data.indicators_snapshot as any) : null},
      ${data.style_match_score}, ${data.entry_price}, ${data.target_price}, ${data.stop_price},
      ${data.risk_reward}, ${data.scan_reasoning}, ${data.status}, ${data.expires_at})
    RETURNING *
  `;
  return row;
}

export async function getScanResults(status?: string, limit = 50): Promise<ScanResult[]> {
  await initDb();
  const sql = getSql();
  if (status) {
    return sql<ScanResult[]>`SELECT * FROM scan_results WHERE status = ${status} ORDER BY style_match_score DESC, scanned_at DESC LIMIT ${limit}`;
  }
  return sql<ScanResult[]>`SELECT * FROM scan_results ORDER BY scanned_at DESC LIMIT ${limit}`;
}

export async function updateScanResultStatus(id: number, status: ScanResult['status']): Promise<void> {
  await initDb();
  const sql = getSql();
  if (status === 'alerted') {
    await sql`UPDATE scan_results SET status = ${status}, alerted_at = NOW() WHERE id = ${id}`;
  } else {
    await sql`UPDATE scan_results SET status = ${status} WHERE id = ${id}`;
  }
}

export async function getScanResultById(id: number): Promise<ScanResult | null> {
  await initDb();
  const sql = getSql();
  const rows = await sql<ScanResult[]>`SELECT * FROM scan_results WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function saveTradeLog(data: Omit<TradeLog, 'id' | 'created_at' | 'closed_at' | 'pnl_usdt'>): Promise<TradeLog> {
  await initDb();
  const sql = getSql();
  const [row] = await sql<TradeLog[]>`
    INSERT INTO trade_log (scan_result_id, symbol, side, entry_price, quantity, target_price, stop_price,
      binance_order_id, binance_sl_order_id, binance_tp_order_id, status, reasoning, approved_at)
    VALUES (${data.scan_result_id}, ${data.symbol}, ${data.side}, ${data.entry_price}, ${data.quantity},
      ${data.target_price}, ${data.stop_price}, ${data.binance_order_id}, ${data.binance_sl_order_id},
      ${data.binance_tp_order_id}, ${data.status}, ${data.reasoning}, ${data.approved_at})
    RETURNING *
  `;
  return row;
}

export async function getTrades(limit = 50): Promise<TradeLog[]> {
  await initDb();
  const sql = getSql();
  return sql<TradeLog[]>`SELECT * FROM trade_log ORDER BY created_at DESC LIMIT ${limit}`;
}

export async function getOpenTrades(): Promise<TradeLog[]> {
  await initDb();
  const sql = getSql();
  return sql<TradeLog[]>`SELECT * FROM trade_log WHERE status = 'open' ORDER BY created_at DESC`;
}

export async function closeTradeLog(id: number, status: 'closed_tp' | 'closed_sl' | 'closed_manual', pnlUsdt: number): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`UPDATE trade_log SET status = ${status}, pnl_usdt = ${pnlUsdt}, closed_at = NOW() WHERE id = ${id}`;
}

export async function getTodayRiskLimits(): Promise<RiskLimits> {
  await initDb();
  const sql = getSql();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await sql<RiskLimits[]>`SELECT * FROM risk_limits WHERE date = ${today}`;
  if (rows[0]) return rows[0];
  const [row] = await sql<RiskLimits[]>`
    INSERT INTO risk_limits (date) VALUES (${today}) ON CONFLICT (date) DO UPDATE SET date = ${today} RETURNING *
  `;
  return row;
}

export async function addDailyLoss(lossUsdt: number): Promise<void> {
  await initDb();
  const sql = getSql();
  const today = new Date().toISOString().slice(0, 10);
  await sql`
    INSERT INTO risk_limits (date, daily_loss_usdt, trade_count)
    VALUES (${today}, ${lossUsdt}, 1)
    ON CONFLICT (date) DO UPDATE
    SET daily_loss_usdt = risk_limits.daily_loss_usdt + ${lossUsdt},
        daily_pnl_usdt = risk_limits.daily_pnl_usdt - ${lossUsdt},
        trade_count = risk_limits.trade_count + 1
  `;
}

export async function addDailyProfit(profitUsdt: number): Promise<void> {
  await initDb();
  const sql = getSql();
  const today = new Date().toISOString().slice(0, 10);
  await sql`
    INSERT INTO risk_limits (date, trade_count)
    VALUES (${today}, 1)
    ON CONFLICT (date) DO UPDATE
    SET daily_pnl_usdt = risk_limits.daily_pnl_usdt + ${profitUsdt},
        trade_count = risk_limits.trade_count + 1
  `;
}
