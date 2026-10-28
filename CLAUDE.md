# studynote

## 투어 가이드 스토리
사용자는 투어 가이드다. 장소·인물·유물·음식·사건 등의 "이야기"를 요청하면 `story` 스킬
(`.claude/skills/story/SKILL.md`)의 구조를 따른다. 대본은 과장·각색을 허용하되, 각색한 부분은 가이드용 각색 노트에 실제 팩트와 짝지어 분리하고, 저장은 `stories/story.mjs` 로 한다.
저장 후에는 `stories/stories.jsonl` 을 커밋·푸시한다.
