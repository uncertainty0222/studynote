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
