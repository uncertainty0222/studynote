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

# 학습지: 5문장씩 한 장 + 레벨 끝마다 확인 테스트
CELLS = 23

def grid(text=""):
    cells = [f"<i>{ch if ch != ' ' else ''}</i>" for ch in text] + ["<i></i>"] * (CELLS - len(text))
    return f'<div class="grid">{"".join(cells)}</div>'

def wb_item(c):
    note = f'<span class="note">{c["note"]}</span>' if c["note"] else ""
    return (f'<div class="item"><div class="head"><span class="n">{c["n"]}</span>'
            f'<div class="t"><div class="ko">{c["ko"]}</div><div class="sub">{c["rr"]} · <span class="vi">{c["vi"]}</span>{note}</div></div>'
            f'<div class="checks"><span class="dots">🔊 듣고 3번 읽기 · Đọc to<span></span><span></span><span></span></span>'
            f'<span>손님에게 말해 봤어요 · Đã nói với khách<span class="sq"></span></span></div></div>'
            f'<div class="row"><span class="lab">따라 쓰기<br>Tô theo</span>{grid(c["ko"])}</div>'
            f'<div class="row"><span class="lab">보고 쓰기<br>Nhìn viết</span>{grid()}</div>'
            f'<div class="row"><span class="lab">가리고 쓰기<br>Che viết</span>{grid()}</div></div>')

HOW = ('<div class="how"><span><b>1</b> 🔊 듣기 · Nghe</span><span><b>2</b> 소리 내어 3번 · Đọc to 3 lần</span>'
       '<span><b>3</b> 연한 글씨 따라 쓰기 · Tô chữ mờ</span><span><b>4</b> 소리 내면서 쓰기 · Vừa đọc vừa viết</span>'
       '<span><b>5</b> 문장을 가리고 쓰기 · Che câu rồi viết</span></div>')

def wb_header(title):
    return f'<header><h1>나나의 50문장 학습지<small>{title}</small></h1><span class="date">날짜 · Ngày ____ / ____</span></header>'

def wb_test(lv):
    # 한 장에 10문제까지. 20문제 레벨은 2장.
    cs, pages = lv["cards"], []
    for i in range(0, len(cs), 10):
        chunk = cs[i:i + 10]
        qs = "".join(f'<div class="q"><div class="p"><b>{c["n"]}</b>{c["vi"]}</div>{grid()}</div>' for c in chunk)
        last = i + 10 >= len(cs)
        score = f'<div class="score">점수 · Điểm: ______ / {len(cs)}</div>' if last else ""
        pages.append(f'<section class="page">{wb_header(f"{lv["ko"]} 확인 테스트 · Kiểm tra · {chunk[0]["n"]}–{chunk[-1]["n"]}")}'
                     f'<div class="how"><span>베트남어를 보고 한국어로 소리 내면서 쓰기. 정답은 인쇄용 문장표에서 확인.</span>'
                     f'<span>Nhìn tiếng Việt, vừa đọc vừa viết tiếng Hàn. Đáp án: xem bảng 50 câu.</span></div>'
                     f'<div class="test">{qs}</div>{score}</section>')
    return "".join(pages)

wb_pages = []
for lv in levels:
    cs = lv["cards"]
    for i in range(0, len(cs), 5):
        chunk = cs[i:i + 5]
        wb_pages.append(f'<section class="page">{wb_header(f"{lv["ko"]} · {chunk[0]["n"]}–{chunk[-1]["n"]}")}{HOW}'
                        + "".join(map(wb_item, chunk)) + "</section>")
    wb_pages.append(wb_test(lv))
wb = open("workbook.tpl.html").read().replace("<!--PAGES-->", "".join(wb_pages))
open(f"{out}/workbook.html", "w").write(wb)
