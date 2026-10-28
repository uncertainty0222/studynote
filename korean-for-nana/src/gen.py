import json, sys
from data import LEVELS, TOP50
out = sys.argv[1]

cards = [dict(n=i + 1, ko=k, rr=r, vi=v, note=n) for i, (k, r, v, n) in enumerate(TOP50)]
levels = [dict(id=f"lv{lv}", ko=ko, vi=vi, cards=cards[a - 1:b]) for lv, ko, vi, a, b in LEVELS]

# 휴대용 문장표 (마크다운)
md = ["# 나나의 손님 응대 50문장 · 50 câu chăm sóc khách", "",
      "순서 = 자주 쓰는 순. 위에서부터 외운다. · Thứ tự = câu dùng nhiều nhất trước. Học từ trên xuống.", ""]
for lv in levels:
    md += [f"## {lv['ko']} · {lv['vi']}", "", "| # | 한국어 | 발음 | Tiếng Việt |", "|---|---|---|---|"]
    for c in lv["cards"]:
        md.append(f"| {c['n']} | **{c['ko']}** | {c['rr']} | {c['vi']}" + (f"<br>*{c['note']}*" if c["note"] else "") + " |")
    md.append("")
open(f"{out}/top50.md", "w").write("\n".join(md))

# 플래시카드
tpl = open("flashcards.tpl.html").read()
open(f"{out}/flashcards.html", "w").write(tpl.replace("/*DECKS*/[]", json.dumps(levels, ensure_ascii=False, indent=1)))

# 인쇄용 A4 2쪽 (1–25 / 26–50)
def row(c):
    note = f'<span class="note">{c["note"]}</span>' if c["note"] else ""
    return (f'<li><span class="n">{c["n"]}</span><span class="box"></span>'
            f'<div class="t"><div class="ko">{c["ko"]}</div>'
            f'<div class="sub"><span class="rr">{c["rr"]}</span> · <span class="vi">{c["vi"]}</span>{note}</div></div></li>')

def page(a, b, title):
    body = []
    for lv in levels:
        cs = [c for c in lv["cards"] if a <= c["n"] <= b]
        if cs:
            body.append(f'<h2>{lv["ko"]} <small>{lv["vi"]}</small></h2><ol>' + "".join(map(row, cs)) + "</ol>")
    return f'<section class="page"><header><h1>나나의 손님 응대 50문장</h1><span>{title}</span></header>{"".join(body)}</section>'

pr = open("print.tpl.html").read()
pr = pr.replace("<!--PAGES-->", page(1, 25, "1 – 25 · 50 câu chăm sóc khách") + page(26, 50, "26 – 50 · 50 câu chăm sóc khách"))
open(f"{out}/top50-print.html", "w").write(pr)
