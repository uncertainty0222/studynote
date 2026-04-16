import aiosqlite
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "expenses.db"

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_date TEXT,
    merchant TEXT,
    category TEXT,
    items TEXT,        -- JSON array of {name, price}
    total INTEGER,     -- in KRW (원)
    image_path TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
"""

CATEGORIES = [
    "식비",
    "카페/음료",
    "교통",
    "쇼핑",
    "생활용품",
    "의료/건강",
    "문화/여가",
    "기타",
]


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_TABLE)
        await db.commit()


async def insert_expense(
    receipt_date: str,
    merchant: str,
    category: str,
    items: list,
    total: int,
    image_path: str,
) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO expenses (receipt_date, merchant, category, items, total, image_path)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (receipt_date, merchant, category, json.dumps(items, ensure_ascii=False), total, image_path),
        )
        await db.commit()
        return cursor.lastrowid


async def get_all_expenses() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM expenses ORDER BY receipt_date DESC, id DESC"
        ) as cursor:
            rows = await cursor.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["items"] = json.loads(d["items"])
        result.append(d)
    return result


async def get_monthly_summary() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT substr(receipt_date, 1, 7) as month,
                      category,
                      SUM(total) as total,
                      COUNT(*) as count
               FROM expenses
               GROUP BY month, category
               ORDER BY month DESC, total DESC"""
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def delete_expense(expense_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        await db.commit()
