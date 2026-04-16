import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from database import delete_expense, get_all_expenses, get_monthly_summary, init_db, insert_expense
from parser import parse_receipt

load_dotenv()

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="영수증 가계부", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
async def root():
    return FileResponse(Path(__file__).parent / "static" / "index.html")


@app.post("/api/receipts/upload")
async def upload_receipts(files: list[UploadFile] = File(...)):
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY가 설정되지 않았습니다.")

    results = []
    for file in files:
        if file.content_type not in ALLOWED_TYPES:
            results.append({"filename": file.filename, "error": "지원하지 않는 파일 형식"})
            continue

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            results.append({"filename": file.filename, "error": "파일 크기 초과 (최대 10MB)"})
            continue

        ext = Path(file.filename).suffix or ".jpg"
        saved_name = f"{uuid.uuid4().hex}{ext}"
        saved_path = UPLOAD_DIR / saved_name

        with open(saved_path, "wb") as f:
            f.write(content)

        parsed = parse_receipt(str(saved_path))

        if "error" in parsed:
            saved_path.unlink(missing_ok=True)
            results.append({"filename": file.filename, "error": parsed["error"]})
            continue

        expense_id = await insert_expense(
            receipt_date=parsed.get("receipt_date", ""),
            merchant=parsed.get("merchant", "알 수 없음"),
            category=parsed.get("category", "기타"),
            items=parsed.get("items", []),
            total=int(parsed.get("total", 0)),
            image_path=f"/uploads/{saved_name}",
        )

        results.append({
            "filename": file.filename,
            "id": expense_id,
            "receipt_date": parsed.get("receipt_date"),
            "merchant": parsed.get("merchant"),
            "category": parsed.get("category"),
            "total": parsed.get("total"),
            "success": True,
        })

    return JSONResponse({"results": results})


@app.get("/api/expenses")
async def list_expenses():
    expenses = await get_all_expenses()
    return {"expenses": expenses}


@app.get("/api/summary")
async def monthly_summary():
    summary = await get_monthly_summary()
    return {"summary": summary}


@app.delete("/api/expenses/{expense_id}")
async def remove_expense(expense_id: int):
    await delete_expense(expense_id)
    return {"ok": True}
