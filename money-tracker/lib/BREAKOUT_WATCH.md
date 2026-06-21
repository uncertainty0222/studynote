# HaxKai 돌파 워처 (봉 마감 → 푸시 알림)

**주문은 사용자가 직접 넣되, 봉 마감이 조건을 충족하면 폰으로 알림을 받는다.**
자동 진입 없음 — 충동 진입을 막는 "한 박자 멈춤"은 유지하고, 24시간 차트를
들여다보는 수고만 없앤다.

## 구성
- `lib/breakoutWatch.ts` — 감시 셋업 정의 + 돌파 판정 로직.
  - 현재 셋업: **`FOLKS_1D`** — FOLKSUSDT, **1D 봉**, 트리거 **1.461**, 손절 1.304, 1R $250.
  - 핵심: Binance klines에서 **직전에 *마감된* 봉**(끝에서 두 번째)의 종가가 트리거 위인지 확인.
    진행 중인 미마감 봉은 쓰지 않음 → 가짜 돌파(꼬리 터치) 방지.
  - **중복 방지**: 한 봉에 대해 1회만 알림. config 키 `breakout_fired:...`에 발동 봉의 openTime 기록.
  - **리셋**: 종가가 다시 트리거 아래로 마감하면 상태 초기화 → 다음 돌파 때 재알림.
- `app/api/cron/breakout/route.ts` — 외부 cron이 깨우는 엔드포인트. `CRON_SECRET`으로 보호.

## 동작 흐름
```
외부 cron (예: cron-job.org, 매시 정각)
  → GET https://<앱>/api/cron/breakout?key=<CRON_SECRET>
     → runWatch(): Binance 1D klines 조회
       → 직전 마감봉 종가 > 1.461 ?
          → 처음이면 sendPushToRole() 로 폰 푸시 + 상태 기록
          → 이미 보냈으면 skip
```
알림 내용 예시:
> 🔔 $FOLKS 돌파 마감! (1d)
> 종가 1.4820 > 트리거 1.4610
> 진입 1.4610 / 손절 1.3040 (1R=$250)
> 수량 1592 · 명목 $2326 · TP1 1.7180 (+1.64R)
> ※ 직접 주문 넣고, 진입과 동시에 SL 등록할 것.

## 알림 채널 — 텔레그램(권장, 가장 쉬움) 또는 웹푸시

워처는 **텔레그램**과 **웹푸시**를 모두 지원한다. 설정된 채널로 전부 보낸다.
설치·구독이 필요 없는 **텔레그램이 가장 간단**하므로 이걸 권장.

### 텔레그램 설정 (3단계)
1. 텔레그램에서 **@BotFather** 와 대화 → `/newbot` → 봇 이름 정하면 **봇 토큰** 발급.
   (예: `123456:ABC-DEF...`)
2. 만든 봇과 대화 시작(아무 메시지나 전송) 후, **내 채팅 ID** 확인:
   - 브라우저에서 `https://api.telegram.org/bot<봇토큰>/getUpdates` 열기
   - 응답 JSON의 `chat.id` 숫자가 내 채팅 ID (예: `987654321`)
3. Railway 환경변수에 추가:
   - `TELEGRAM_BOT_TOKEN` = 봇 토큰
   - `TELEGRAM_CHAT_ID` = 채팅 ID
   - `CRON_SECRET` = 임의의 긴 문자열 (cron 인증용)

설정 확인:
```
https://<배포주소>/api/cron/breakout/test?key=<CRON_SECRET>
```
→ 텔레그램으로 "✅ 워처 테스트" 메시지가 오면 성공. 응답 JSON에 `telegramSent:true`.

### (선택) 웹푸시
앱을 폰에 설치하고 알림 권한 허용 → `push_subscriptions`에 저장됨.
`WATCH_PUSH_ROLE` = `husband`(기본)/`wife` 로 받을 역할 지정.
텔레그램을 쓰면 웹푸시는 굳이 설정 안 해도 됨.

## 배포 설정 (Railway)
1. **환경변수 추가** — 위 텔레그램 3단계의 `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `CRON_SECRET`.
2. **외부 cron 등록** (예: https://cron-job.org 무료)
   - URL: `https://<배포주소>/api/cron/breakout?key=<CRON_SECRET>`
   - 주기: 1D 기준이면 **매시 정각**이면 충분 (봉 마감 직후 한 번이면 되고, 중복은 자동 차단).
   - 또는 헤더 방식: `Authorization: Bearer <CRON_SECRET>`

## 수동 점검
배포 후 브라우저/curl로 직접 호출해 상태 확인 (알림은 조건 충족 시에만):
```
curl "https://<배포주소>/api/cron/breakout?key=<CRON_SECRET>"
# → { ok:true, results:[{ symbol, lastClosedClose, triggered, fired, reason }] }
```
`triggered`/`fired`/`reason` 으로 현재 상태를 눈으로 확인할 수 있다.

## 셋업 변경/추가
`lib/breakoutWatch.ts`의 `FOLKS_1D` 값을 수정하거나, 새 `WatchSetup`을 만들어
`runWatch()`의 `setups` 배열에 추가하면 된다. (추후 다중 셋업을 앱 UI에서
관리하려면 config/DB 테이블로 옮기는 후속 작업 필요.)
```
