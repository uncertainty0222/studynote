import json, sys
from data import DECKS
out = sys.argv[1]

md = ["# 나나의 실전 한국어 문장집 · Câu tiếng Hàn dùng ngay", "",
      "손님 존댓말(1–9) / 남편 반말(10–11). 외운 문장은 `[ ]` → `[x]`.", "",
      "Câu nói với khách: lịch sự (1–9). Câu nói với chồng: thân mật (10–11). Thuộc rồi thì đánh dấu `[x]`.", ""]
for _, ko, vi, cards in DECKS:
    md += [f"## {ko} · {vi}", "", "| ✓ | 한국어 | 발음 (phát âm) | Tiếng Việt |", "|---|---|---|---|"]
    for k, r, v, n in cards:
        md.append(f"| [ ] | **{k}** | {r} | {v}" + (f"<br>*{n}*" if n else "") + " |")
    md.append("")
open(f"{out}/phrases.md", "w").write("\n".join(md))

js = json.dumps([{"id": i, "ko": ko, "vi": vi, "cards": [dict(ko=k, rr=r, vi=v, note=n) for k, r, v, n in c]}
                 for i, ko, vi, c in DECKS], ensure_ascii=False, indent=1)
tpl = open("flashcards.tpl.html").read()
open(f"{out}/flashcards.html", "w").write(tpl.replace("/*DECKS*/[]", js))
