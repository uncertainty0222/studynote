// config.mjs — 봇 설정. 여기만 고치면 대상 사이트/문구/필터를 바꿀 수 있다.
//
// 대상 사이트는 sources.mjs 에 정의된 어댑터 이름으로 고른다.
// 현재 지원: 'ilbe' (일베 일간베스트), 'dcbest' (디시 실시간베스트),
//            'dcgall' (디시 특정 갤러리 개념글)

export const config = {
  // ── 어떤 소스에서 인기글을 가져올지 ──────────────────────────
  // 배열로 여러 개 넣으면 합쳐서 한 대시보드에 보여준다.
  sources: [
    { adapter: 'ilbe', label: '일간베스트', enabled: true },

    // 디시 특정 갤러리 개념글을 쓰려면 enabled: true 로 바꾸고 gallId 지정.
    // { adapter: 'dcgall', label: '우파갤 개념글', gallId: 'YOUR_GALL_ID', enabled: false },

    // 디시 실시간베스트(정치성향 혼재) — 참고용.
    // { adapter: 'dcbest', label: '실시간베스트', enabled: false },
  ],

  // ── 몇 개나 뽑을지 / 필터 ────────────────────────────────────
  maxPosts: 15, // 대시보드에 올릴 최대 글 수
  minScore: 0, // 추천수 최소 기준(0이면 필터 안 함). 사이트가 추천수를 제공할 때만 적용.
  // 제목에 이 단어가 들어가면 제외(스팸/공지/불판 등 걸러내기). 소문자로.
  excludeKeywords: ['공지', '이벤트', '점검'],

  // ── 트윗 문구 템플릿 ─────────────────────────────────────────
  // {title}=글제목, {url}=원문링크, {source}=소스라벨
  // 트위터 가중글자수(한글 2, URL 23)를 계산해 자동으로 제목을 줄여준다.
  tweetTemplate: '【{source}】{title}\n\n출처: {url}',
  hashtags: [], // 예: ['#일간베스트'] — 넣으면 문구 끝에 붙는다.

  // ── 스크래핑 엔진 ────────────────────────────────────────────
  // 'playwright' = 실제 브라우저(Cloudflare/JS 렌더 대응, 권장)
  // 'fetch'      = 단순 HTTP(가볍지만 봇차단에 약함)
  engine: 'playwright',
  headless: true,
  // 브라우저 실행 파일 경로(이 환경엔 /opt/pw-browsers/chromium). 비우면 자동탐색.
  browserExecutable: process.env.PW_CHROMIUM || '',
  navTimeoutMs: 30000,

  // ── 출력 ─────────────────────────────────────────────────────
  outDir: 'out', // 대시보드 HTML을 저장할 폴더(이 파일 기준 상대경로)
  dashboardTitle: '오늘의 인기글 → 트위터',

  // ── 텔레그램 알림(선택) ──────────────────────────────────────
  // 환경변수 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 가 있으면 자동으로 켜진다.
  // dashboardPublicUrl 을 채우면 알림에 대시보드 링크가 들어간다(Railway 배포시 URL).
  telegram: {
    enabled: true, // 토큰/챗ID 있을 때만 실제로 전송
    dashboardPublicUrl: process.env.DASHBOARD_URL || '',
  },
};
