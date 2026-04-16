# 영수증 가계부

영수증 사진을 던지면 Claude AI가 자동으로 날짜·항목·카테고리별로 가계부를 정리해주는 웹 앱입니다.

## 기능

- **사진 뭉텅이 업로드** — 드래그앤드롭 또는 클릭으로 여러 장 한 번에
- **자동 OCR + AI 파싱** — Claude Vision API로 날짜, 가게명, 품목, 금액 추출
- **자동 카테고리 분류** — 식비 / 카페·음료 / 교통 / 쇼핑 / 생활용품 / 의료·건강 / 문화·여가 / 기타
- **이번 달 요약 카드** — 카테고리별 지출 한눈에
- **날짜·카테고리 필터** — 원하는 기간·항목만 보기
- **영수증 원본 확인** — 항목 클릭 시 원본 이미지 팝업

## 설치 & 실행

```bash
cd receipt-tracker

# 1. 의존성 설치
pip install -r requirements.txt

# 2. API 키 설정
cp .env.example .env
# .env 파일에 ANTHROPIC_API_KEY 입력

# 3. 서버 실행
uvicorn app:app --reload --port 8000
```

브라우저에서 `http://localhost:8000` 접속

## 구조

```
receipt-tracker/
├── app.py          # FastAPI 서버
├── database.py     # SQLite (aiosqlite)
├── parser.py       # Claude Vision API 파싱
├── static/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── uploads/        # 업로드된 영수증 이미지
└── expenses.db     # 자동 생성되는 DB
```
