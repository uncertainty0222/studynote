# 베트남 뉴스 브리핑

베트남 최신 이슈와 한국 관련 뉴스를 **베트남 언론 · 해외 언론 · 한국 언론** 세 갈래에서 모아 한 화면에 보여주는 Next.js 앱.

## 기능
- 소스별 탭: 전체 / 베트남 언론 / 해외 언론 / 한국 언론 / 화제·SNS
- Google Trends 베트남 실시간 검색어 (상단)
- `이야깃거리` 필터: 문화·연예·음식, 관광, 사회 주제 + 한국 관련 + SNS 화제
- `한국 관련만` 필터 (Korea, Samsung, Hàn Quốc, 한국, 교민 등 키워드)
- 주제 분류: 정치·외교, 경제·투자, 관광·여행, 사회·사건, 문화·연예·음식, 날씨·재해, 교통·인프라
- 기간(24시간/3일/7일), 검색
- 상단 요약: 최근 24시간 주제별 기사 수, 한국 관련 최신 기사
- 피드별 수집 성공/실패 상태 표시 (하단 "수집 피드 상태")
- 서버 인메모리 캐시 15분, `새로고침` 버튼은 강제 재수집

## 소스 (`lib/sources.ts`)
| 구분 | 소스 | 방식 |
|---|---|---|
| 베트남 | VnExpress International, VnExpress(베트남어) | 직접 RSS |
| 베트남 | Tuoi Tre News, Vietnam News, VietnamPlus | Google News RSS (`site:`) |
| 베트남 | 베트남어 언론의 "Hàn Quốc"(한국) 기사 | Google News RSS (vi) |
| 해외 | Reuters, AP, BBC, Bloomberg, Nikkei Asia, SCMP, The Diplomat, Al Jazeera, CNN, NYT, Guardian | Google News RSS (`site:`) |
| 해외 | 베트남-한국 관련 영문 기사, BBC Asia(베트남 기사만) | Google News RSS / 직접 RSS |
| 한국 | "베트남" 한국어 기사, 여행·교민 관련, 인사이드비나, 씬짜오베트남 | Google News RSS (ko) |
| 화제·SNS | Google Trends 베트남 실시간 검색어 | Trends RSS |
| 화제·SNS | Kenh14(연예·SNS), 베트남 언론의 'cư dân mạng/mạng xã hội/viral' 기사, Tuoi Tre News viral | Google News RSS |
| 화제·SNS | Reddit r/VietNam 오늘 인기 글 | Reddit RSS |

소스 추가·삭제는 `SOURCES` 배열만 수정하면 된다. Google News 링크는 `news.google.com` 경유 후 원문으로 이동한다.

## AI 기능: 제목 번역 · 최근 30일 TOP 10 (선택)
`ANTHROPIC_API_KEY`를 설정하면 켜진다. 키는 https://console.anthropic.com 에서 발급(결제수단 등록 필요).

- **제목 번역:** 영어·베트남어 기사 제목을 한국어로 번역해 위에 크게, 원문은 아래 작게 표시. 같은 제목은 한 번만 번역한다.
- **최근 30일 TOP 10:** Google News 30일 검색(영·한·베)과 현재 수집 기사 제목 최대 400개를 Claude가 읽고, 같은 사건을 묶어 파급력 큰 10건을 골라 한국어 요약과 '손님에게 한마디'를 쓴다. 하루 1회 갱신. 각 항목을 누르면 근거 기사 링크가 보인다. 제목만 보고 쓰므로 세부 수치는 원문 확인.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 없음 (없으면 꺼짐) | Claude API 키 |
| `TRANSLATE_MODEL` | `claude-opus-5-5` | 번역 모델. 비용을 줄이려면 `claude-haiku-5-5` |
| `TOP10_MODEL` | `claude-opus-5-5` | TOP 10 모델 |
| `TOP10_REFRESH_HOURS` | 24 | TOP 10 갱신 주기 |

비용 추정(실측 아님): Opus 5.5($4/$20 per 1M 토큰) 기준 번역 월 약 $7, TOP 10 월 약 $5. Haiku 5.5($0.10/$0.50)로 바꾸면 월 $1 미만. Anthropic Console의 Usage 화면에서 실제 사용량을 확인할 것.

## 금융·코인·부동산 탭
베트남어·영어·한국어로 암호화폐, 금융·증시(금리·환율·금값), 부동산 기사를 따로 모은다. 이 탭 전용 소스의 기사는 일반 뉴스 목록에 섞이지 않는다. 일반 소스에서 잡힌 금융 기사는 두 곳 모두에 보인다.

## 페이스북 화제 게시글 (선택)
Apify의 공식 수집기 `apify/facebook-posts-scraper`로 인기 페이지의 공개 게시글을 로그인 없이 가져와 반응·댓글·공유 순으로 보여준다. 개인 페이스북 계정은 쓰지 않는다.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `APIFY_TOKEN` | 없음 (없으면 기능 꺼짐) | Apify Console → Settings → Integrations에서 발급 |
| `FB_PAGES` | Theanh28, Theanh28 Trending, Beatvn | 쉼표로 구분한 페이지 주소 |
| `FB_REFRESH_HOURS` | 6 | 수집 주기(시간). 짧을수록 비용 증가 |
| `FB_POSTS_PER_PAGE` | 10 | 페이지당 수집 게시글 수 |

- 비용: Apify가 게시글 수로 과금한다(공식 페이지 표기 1,000개당 $2~5, 표기가 엇갈리므로 Apify에서 확인). 기본값이면 하루 약 120개(3페이지 × 10개 × 4회).
- 새로고침 버튼은 뉴스만 다시 받고 페이스북 수집은 다시 돌리지 않는다.
- 수집은 백그라운드에서 돌아서 서버 시작 후 첫 결과까지 몇 분 걸린다. 서버가 재시작되면 저장본이 사라지고 다시 수집한다.
- 페이스북 이용약관은 허가 없는 자동 수집을 금지한다. 로그아웃 상태의 공개 데이터 수집은 Meta v. Bright Data(2024, 미국 연방지법)에서 약관 위반이 아니라고 판단됐지만 상급심 판례는 아니다. 페이스북이 수집을 막으면 이 기능은 멈춘다.

## 실행
```bash
npm install
npm run dev     # http://localhost:3000
```

## 배포 (Railway)
money-tracker와 같은 방식. Railway 새 서비스에서 Root Directory를 `vietnam-news`로 지정하면 `railway.toml`대로 빌드/실행된다. 환경변수 불필요.

## 한계
- 페이스북 트렌드는 직접 가져오지 않는다. 페이스북은 2018년 6월 'Trending' 기능을 없앴고, 분석 도구 CrowdTangle도 2024년 8월 종료됐다. 후속 도구(Meta Content Library)는 학술·비영리 연구자만 쓸 수 있다. 그래서 SNS 화제를 기사로 다루는 베트남 매체와 Google Trends로 대신한다.
- Google Trends RSS와 Reddit RSS는 공식 문서화된 API가 아니어서 막히거나 형식이 바뀔 수 있다.
- 주제·한국 관련 분류는 키워드 매칭이라 오분류가 있다.
- Google News RSS는 공식 API가 아니므로 형식이 바뀌거나 차단될 수 있다. 실패 시 화면 상단에 경고가 뜬다.
