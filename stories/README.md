# 투어 가이드 스토리 DB (`story.mjs`)

Claude Code 대화에서 장소·인물·유물 등에 대한 이야기를 요청하면, `.claude/skills/story/SKILL.md`
규칙에 따라 **훅 → 현장 대본(과장·각색 허용) → 🎭 각색 노트(실제 팩트) → 강한 인상 → 신뢰 포인트 → 행동 유도·매출 연결 → 사실 검증 →
"더 알아볼래?" 다음 꼭지** 구조로 구성하고, 원하면 `stories.jsonl` 에 저장한다.

## 사용 예 (대화)
- "경복궁 경회루 이야기 해줘"
- "2번 꼭지 더 알아볼래" → 이어서 새 이야기
- "이거 저장해줘" → DB 저장 + 커밋·푸시
- "경복궁 관련 저장된 이야기 보여줘" / "다음 투어 준비할 꼭지 뭐 남았어?"

## CLI (의존성 0, Node 18+)
```
node stories/story.mjs add [--replace] < story.json
node stories/story.mjs list [--place X] [--tag X] [--status draft|ready|used]
node stories/story.mjs search <키워드...>
node stories/story.mjs show <id>
node stories/story.mjs hooks      # 제안됐지만 아직 안 만든 꼭지
node stories/story.mjs tags
```

## 데이터 형식
`stories.jsonl` 한 줄 = 한 이야기. 필수: `title, place, hook, story, facts[]`.
`facts[].status` 는 `fact`(출처 필수) · `disputed` · `legend`.
`embellishments[]` 는 대본 속 각색 멘트(`line`)와 실제 팩트(`fact`)의 짝 — 손님용 대본과 가이드용 진실을 분리하는 장치.

## 주의
- 이 환경의 컨테이너는 휘발성. **저장 후 git 커밋·푸시해야 보존**된다.
- DB는 git 저장소 안의 파일이다. 여러 기기·앱에서 실시간 공유가 필요하면 별도 DB(예: money-tracker의 Postgres)로 옮겨야 한다.

## 출력본 (A4 PDF)
```
node stories/print.mjs <id> [<id> ...] [--out stories/print/파일명.pdf]
```
이야기마다 1쪽: 훅·현장 대본(각색 표시)·강한 인상 / 2쪽: 각색 노트·신뢰 포인트·행동 유도·사실 검증·다음 꼭지(가이드 전용).
이야기에 `"layout": {"inlineHook": true, "onePage": true}` 를 넣으면 훅을 박스 없이 대본 첫 문단으로 녹이고, 대본이 A4 한 장에 들어가도록 글자 크기를 자동으로 줄인다(최소 9.5pt).
Playwright Chromium 이 있으면 PDF, 없으면 HTML 을 만든다(브라우저에서 인쇄).

## 멘트 등급 (tier)
- **초안**: 대화로 즉흥적으로 만든 멘트 (기본값) → `print/초안/`
- **실전본**: 가이드가 자기 목소리로 다듬은 멘트 → `print/실전본/`
- **견본**: 다른 사람이 만든, 교본으로 삼는 멘트 → `print/견본/`, 원문·분석 `reference/`

```
node stories/story.mjs list --tier 실전본
node stories/print.mjs <id> --out stories/print/실전본/파일명.pdf
```

## 작업 파이프라인 (6단계)
1. 반응 순위 보기 — `node stories/story.mjs rank`
2. 잘된 멘트 뜯어보기 — `reference/` (분석 틀: `reference/_견본분석-틀.md`)
3. 사실 모으기 — `canon/팩트장부.md` (연속성 파일, 먼저 읽고 새 사실은 추가)
4. 쓰기 (초안)
5. 사람 냄새 점검 (AI 티 빼기 6가지 — 스킬 01-A)
6. 출력·기록 — PDF, `tours/<날짜_지역>.md`, 현장 반응 `react`

```
node stories/story.mjs react <id> --score 1~5 [--team "C팀 50대 동기"] [--note "메모"]
node stories/story.mjs rank
```
