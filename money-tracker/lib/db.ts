import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'money.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payer TEXT NOT NULL CHECK(payer IN ('husband', 'wife')),
      amount INTEGER NOT NULL CHECK(amount > 0),
      memo TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  return db;
}

export interface Transaction {
  id: number;
  payer: 'husband' | 'wife';
  amount: number;
  memo: string;
  date: string;
  created_at: string;
}

export interface Balance {
  husbandOwes: number;  // positive = husband owes wife, negative = wife owes husband
  husbandTotal: number;
  wifeTotal: number;
}

export function getTransactions(limit?: number, offset?: number): Transaction[] {
  const db = getDb();
  const query = limit != null
    ? db.prepare('SELECT * FROM transactions ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?')
    : db.prepare('SELECT * FROM transactions ORDER BY date DESC, created_at DESC');
  return (limit != null ? query.all(limit, offset ?? 0) : query.all()) as Transaction[];
}

export function getTransactionCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number };
  return row.count;
}

export function createTransaction(data: Omit<Transaction, 'id' | 'created_at'>): Transaction {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO transactions (payer, amount, memo, date) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(data.payer, data.amount, data.memo, data.date);
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid) as Transaction;
}

export function deleteTransaction(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getBalance(): Balance {
  const db = getDb();
  const rows = db.prepare(
    "SELECT payer, SUM(amount) as total FROM transactions GROUP BY payer"
  ).all() as { payer: string; total: number }[];

  const husbandTotal = rows.find(r => r.payer === 'husband')?.total ?? 0;
  const wifeTotal = rows.find(r => r.payer === 'wife')?.total ?? 0;

  // husband paid husbandTotal → wife owes husband husbandTotal
  // wife paid wifeTotal → husband owes wife wifeTotal
  // net: how much husband owes wife = wifeTotal - husbandTotal
  return {
    husbandOwes: wifeTotal - husbandTotal,
    husbandTotal,
    wifeTotal,
  };
}
