import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'money.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('husband', 'wife')),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payer TEXT NOT NULL CHECK(payer IN ('husband', 'wife')),
      amount INTEGER NOT NULL CHECK(amount > 0),
      memo TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_by TEXT NOT NULL DEFAULT 'husband' CHECK(created_by IN ('husband', 'wife')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS deletion_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      requested_by TEXT NOT NULL CHECK(requested_by IN ('husband', 'wife')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Migration: add new columns to existing transactions table if missing
  const txCols = (db.pragma('table_info(transactions)') as Array<{ name: string }>).map(c => c.name);
  if (!txCols.includes('status')) {
    db.exec("ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  }
  if (!txCols.includes('created_by')) {
    db.exec("ALTER TABLE transactions ADD COLUMN created_by TEXT NOT NULL DEFAULT 'husband'");
  }

  return db;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  role: 'husband' | 'wife';
  name: string;
  email: string;
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
  // joined fields
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

export function getUserCount(): number {
  return (getDb().prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
}

export function getUserByEmail(email: string): User | null {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as User | null;
}

export function getUserById(id: number): User | null {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | null;
}

export function createUser(data: Omit<User, 'id'>): User {
  const db = getDb();
  const r = db.prepare(
    'INSERT INTO users (role, name, email, password_hash) VALUES (?, ?, ?, ?)'
  ).run(data.role, data.name, data.email, data.password_hash);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid) as User;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export function createSession(userId: number): string {
  const token = crypto.randomUUID();
  getDb().prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

export function getSessionUser(token: string): User | null {
  return getDb().prepare(
    'SELECT users.* FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.token = ?'
  ).get(token) as User | null;
}

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export function getTransactions(): Transaction[] {
  return getDb().prepare(
    "SELECT * FROM transactions WHERE status != 'rejected' ORDER BY date DESC, created_at DESC"
  ).all() as Transaction[];
}

export function getTransactionById(id: number): Transaction | null {
  return getDb().prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction | null;
}

export function createTransaction(data: {
  payer: 'husband' | 'wife';
  amount: number;
  memo: string;
  date: string;
  created_by: 'husband' | 'wife';
}): Transaction {
  const db = getDb();
  const r = db.prepare(
    'INSERT INTO transactions (payer, amount, memo, date, status, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(data.payer, data.amount, data.memo, data.date, 'pending', data.created_by);
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(r.lastInsertRowid) as Transaction;
}

export function approveTransaction(id: number): boolean {
  return getDb().prepare(
    "UPDATE transactions SET status = 'approved' WHERE id = ? AND status = 'pending'"
  ).run(id).changes > 0;
}

export function rejectTransaction(id: number): boolean {
  return getDb().prepare(
    "UPDATE transactions SET status = 'rejected' WHERE id = ? AND status = 'pending'"
  ).run(id).changes > 0;
}

// ─── Deletion Requests ────────────────────────────────────────────────────────

export function createDeletionRequest(transactionId: number, requestedBy: 'husband' | 'wife'): DeletionRequest {
  const db = getDb();
  const existing = db.prepare(
    "SELECT * FROM deletion_requests WHERE transaction_id = ? AND status = 'pending'"
  ).get(transactionId) as DeletionRequest | null;
  if (existing) return existing;

  const r = db.prepare(
    'INSERT INTO deletion_requests (transaction_id, requested_by) VALUES (?, ?)'
  ).run(transactionId, requestedBy);
  return db.prepare('SELECT * FROM deletion_requests WHERE id = ?').get(r.lastInsertRowid) as DeletionRequest;
}

export function getPendingDeletionRequests(): DeletionRequest[] {
  return getDb().prepare(`
    SELECT dr.*, t.payer, t.amount, t.memo, t.date
    FROM deletion_requests dr
    JOIN transactions t ON dr.transaction_id = t.id
    WHERE dr.status = 'pending'
    ORDER BY dr.created_at DESC
  `).all() as DeletionRequest[];
}

export function getDeletionRequestById(id: number): DeletionRequest | null {
  return getDb().prepare('SELECT * FROM deletion_requests WHERE id = ?').get(id) as DeletionRequest | null;
}

export function approveDeletion(id: number): boolean {
  const db = getDb();
  const req = db.prepare('SELECT * FROM deletion_requests WHERE id = ?').get(id) as DeletionRequest | null;
  if (!req || req.status !== 'pending') return false;
  db.prepare("UPDATE deletion_requests SET status = 'approved' WHERE id = ?").run(id);
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.transaction_id);
  return true;
}

export function rejectDeletion(id: number): boolean {
  return getDb().prepare(
    "UPDATE deletion_requests SET status = 'rejected' WHERE id = ? AND status = 'pending'"
  ).run(id).changes > 0;
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export function getBalance(): Balance {
  const rows = getDb().prepare(
    "SELECT payer, SUM(amount) as total FROM transactions WHERE status = 'approved' GROUP BY payer"
  ).all() as { payer: string; total: number }[];
  const husbandTotal = rows.find(r => r.payer === 'husband')?.total ?? 0;
  const wifeTotal = rows.find(r => r.payer === 'wife')?.total ?? 0;
  return { husbandOwes: wifeTotal - husbandTotal, husbandTotal, wifeTotal };
}

export function getPendingCountForRole(role: 'husband' | 'wife'): number {
  const db = getDb();
  const pendingTx = (db.prepare(
    "SELECT COUNT(*) as count FROM transactions WHERE status = 'pending' AND created_by != ?"
  ).get(role) as { count: number }).count;
  const pendingDel = (db.prepare(
    "SELECT COUNT(*) as count FROM deletion_requests WHERE status = 'pending' AND requested_by != ?"
  ).get(role) as { count: number }).count;
  return pendingTx + pendingDel;
}
