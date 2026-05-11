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

    await sql`
      CREATE TABLE IF NOT EXISTS asset_snapshots (
        id SERIAL PRIMARY KEY,
        total_usd DOUBLE PRECISION NOT NULL,
        vault_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        binance_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        usd_to_vnd DOUBLE PRECISION NOT NULL DEFAULT 25800,
        snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Seed pre-configured accounts
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

export async function updatePersonalExpense(id: number, fields: { category?: string; merchant?: string; amount?: number; currency?: string; date?: string }): Promise<void> {
  await initDb();
  const sql = getSql();
  const { category, merchant, amount, currency, date } = fields;
  await sql`
    UPDATE personal_expenses SET
      category  = COALESCE(${category  ?? null}, category),
      merchant  = COALESCE(${merchant  ?? null}, merchant),
      amount    = COALESCE(${amount    ?? null}, amount),
      currency  = COALESCE(${currency  ?? null}, currency),
      date      = COALESCE(${date      ?? null}, date)
    WHERE id = ${id}
  `;
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

// ─── Asset Snapshots ──────────────────────────────────────────────────────────

export interface AssetSnapshot {
  id: number;
  total_usd: number;
  vault_usd: number;
  binance_usd: number;
  usd_to_vnd: number;
  snapshot_at: string;
}

export async function createAssetSnapshot(data: { totalUsd: number; vaultUsd: number; binanceUsd: number; usdToVnd: number }): Promise<void> {
  await initDb();
  const sql = getSql();
  await sql`
    INSERT INTO asset_snapshots (total_usd, vault_usd, binance_usd, usd_to_vnd)
    VALUES (${data.totalUsd}, ${data.vaultUsd}, ${data.binanceUsd}, ${data.usdToVnd})
  `;
}

export async function getAssetSnapshots(): Promise<AssetSnapshot[]> {
  await initDb();
  const sql = getSql();
  return sql<AssetSnapshot[]>`SELECT * FROM asset_snapshots ORDER BY snapshot_at ASC`;
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
