# community-bot — 커뮤니티 일일 인기글 → 딸깍 트윗

한국 우파 커뮤니티(기본: **일베 일간베스트**)의 **일일 인기글**을 긁어와,
**미리 작성된 트윗 문구 + [🐦 트위터에 올리기] 버튼**이 달린 대시보드로 만들어 준다.
형님은 카드를 보고 문구를 확인·수정한 뒤 버튼을 누르면, 문구가 채워진 트위터
작성창이 열린다. **거기서 '게시'만 누르면 끝** — 완전 자동이 아니라 사람이
한 번 확인하고 올리는 반자동 방식이라 계정 차단 위험이 낮다.

```
수집(스크래핑) → 트윗 문구 생성 → 대시보드 HTML → [딸깍] → 트위터 작성창 → 게시
```

## 빠른 시작

```bash
cd community-bot
npm install                 # playwright 설치
npx playwright install chromium   # 브라우저 바이너리(최초 1회)

node bot.mjs --sample       # 네트워크 없이 샘플로 대시보드 UX 먼저 확인
open out/index.html         # (mac) / Windows: start out/index.html

node bot.mjs                # 실제 수집 → out/index.html 생성
```

> **이 개발 샌드박스에서는 커뮤니티 사이트가 egress 정책으로 차단되어 실제
> 수집이 안 된다.** 반드시 사이트가 열리는 환경(본인 PC / Railway)에서 `node bot.mjs`
> 를 돌려야 한다. `--sample` 은 어디서든 되고, 대시보드 UI 는 이미 검증됨.

## 사용법

```bash
node bot.mjs                # 수집 → out/index.html (+ 텔레그램 알림)
node bot.mjs --sample       # 샘플 데이터로 대시보드만 생성(망 불필요)
node bot.mjs --debug        # 수집 상세 로그(셀렉터 점검용)
node bot.mjs --serve        # out/index.html 을 웹서버로 제공(기본 :8080)
node bot.mjs --once --serve # 한 번 수집 후 서버 유지 (Railway 배포용)
```

## 설정 (`config.mjs`)

- `sources` — 어떤 사이트에서 가져올지. `ilbe`(기본), `dcgall`(디시 특정 갤 개념글),
  `dcbest`(디시 실시간베스트). 여러 개 켜면 한 대시보드에 합쳐진다.
- `maxPosts` / `minScore` / `excludeKeywords` — 개수·추천수·제외어 필터.
- `tweetTemplate` — 트윗 문구 틀. `{source} {title} {url}` 치환. 280자(가중) 넘으면
  제목을 자동으로 `…` 축약.
- `hashtags` — 문구 끝에 붙일 해시태그(기본 비어있음).
- `engine` — `playwright`(권장, Cloudflare 대응) 또는 `fetch`(경량).

### 대상 사이트 바꾸기 / 디시 갤 쓰기

`config.mjs` 의 `sources` 에서:

```js
sources: [
  { adapter: 'dcgall', label: '우파갤 개념글', gallId: '갤러리아이디', enabled: true },
]
```

`gallId` 는 갤러리 주소 `gall.dcinside.com/board/lists/?id=XXX` 의 `XXX` 부분.

## ⚠️ 셀렉터는 한 번 점검해야 한다

커뮤니티 사이트는 HTML 구조를 수시로 바꾼다. `sources.mjs` 의 `selectors` 는
합리적 초기값일 뿐이라, 처음 돌릴 때 `--debug` 로 몇 개 잡히는지 확인하고,
0개면 실제 사이트의 목록 DOM 을 보고 `row`/`title`/`score` 셀렉터를 맞춰야 한다.

```bash
node bot.mjs --debug     # "[debug] ilbe: N개 수집" 확인
```

## 텔레그램 알림(선택)

환경변수만 넣으면 자동으로 켜진다. 매일 "인기글 N개 준비됨" + 글별 원문·트윗
인텐트 링크를 보내준다(폰에서 바로 딸깍 가능).

```bash
export TELEGRAM_BOT_TOKEN=123456:abc...
export TELEGRAM_CHAT_ID=987654321
export DASHBOARD_URL=https://your-app.up.railway.app   # (선택) 대시보드 공개주소
node bot.mjs
```

봇 토큰은 @BotFather, 챗 ID 는 봇에게 아무 메시지나 보낸 뒤
`https://api.telegram.org/bot<TOKEN>/getUpdates` 에서 확인.

## 배포

### A. 본인 PC(가장 확실) — 매일 수동/크론

```bash
node bot.mjs && open out/index.html
```

crontab 예시(매일 오전 7시):
```
0 7 * * * cd /path/to/community-bot && /usr/bin/node bot.mjs
```

### B. Railway (money-tracker 처럼)

- 시작 명령: `node bot.mjs --once --serve` — 배포 시 1회 수집하고 대시보드를 웹으로 서빙.
- 매일 자동 수집은 Railway 크론(별도 서비스)에서 `node bot.mjs` 를 하루 1회 실행하거나,
  `bot.mjs` 를 setInterval 로 감싸 24시간마다 `buildOnce()` 하도록 확장하면 된다.
- 텔레그램/대시보드 환경변수를 Railway Variables 에 등록.
- Playwright 브라우저 설치가 필요하므로 빌드에 `npx playwright install --with-deps chromium` 포함.

### C. GitHub Actions

`.github-workflow-example.yml` 을 `.github/workflows/` 로 복사.
단, GitHub 러너 IP 가 커뮤니티 사이트에서 차단될 수 있어 A/B 를 더 권장.

## 파일 구조

| 파일 | 역할 |
|---|---|
| `bot.mjs` | 메인 CLI (수집 → 필터 → 대시보드 → 텔레그램/서버) |
| `config.mjs` | 사이트·문구·필터 설정 |
| `sources.mjs` | 사이트별 스크래핑 어댑터 + 엔진(playwright/fetch) |
| `format.mjs` | 트윗 문구 생성 + 트위터 가중 글자수 계산 |
| `dashboard.mjs` | 딸깍 트윗 대시보드 HTML 생성 |
| `sample-data.json` | 망 없이 UX 확인용 샘플 |

## 참고 (책임 범위)

- 이 도구는 **공개된 인기글을 사람이 확인하고 직접 올리도록 돕는 반자동 포워더**다.
  실제 게시는 형님이 버튼을 눌러야 일어난다.
- 원문 저작권/각 사이트 이용약관/트위터(X) 정책 준수는 사용자 책임이다. 무리한
  대량·고빈도 자동화는 계정·법적 리스크가 있으니 하루 1회 정도로 사람이 검수해서 쓰자.
