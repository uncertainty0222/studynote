"""
HAS 메인 화면(has.hanatour.net/main) HTML에서 배정된 행사와 공동행사 묶음을 뽑는다.

화면 구조(2026-10 기준):
  section.content > div            행사 1건(대표) + 그 공동행사 목록
    h2.pinkTit                     "행사 N일전" 막대
    ul.titList_wid / ul.titList_hei  출발일·인원 / 상품·항공·룸
    a.btnBar                       "공동행사 N건"
    div.inContBox > div ...        공동행사들(같은 ul 구조)
  대표 행사마다 같은 묶음이 반복되므로 행사코드 집합으로 중복을 없앤다.

사용:
    python parse_main.py dumps/01_xxxxxx.html
"""
import re
import sys
from dataclasses import dataclass, field
from datetime import date

from bs4 import BeautifulSoup


@dataclass
class Tour:
    code: str
    title: str
    start: date
    end: date
    adult: int
    child: int
    infant: int
    flight_from: str
    flight_to: str
    flight_no: str
    rooms: dict
    requests: int
    product_url: str
    schedule_path: str

    @property
    def pax(self):
        return self.adult + self.child + self.infant


@dataclass
class Group:
    tours: list = field(default_factory=list)

    @property
    def codes(self):
        return frozenset(t.code for t in self.tours)


def _text(el):
    return el.get_text(" ", strip=True) if el else ""


def _int(s):
    m = re.search(r"\d+", s or "")
    return int(m.group()) if m else 0


def _parse_tour(wid, hei, scope):
    start = date(*map(int, re.findall(r"\d+", _text(wid.find("strong")))[:3]))
    pax = _text(wid.select_one("span.c_gray"))
    link = hei.select_one("li a")
    code = _text(link.select_one("em.code")).split()[-1]
    m = re.search(r"'(https://m\.hanatour\.com[^']+)'", link.get("onclick", ""))
    air = hei.select_one("div.airLine")
    spans = air.find_all("span") if air else []
    room_div = scope.find("div", attrs={"data-pkgcode": code})
    rooms = {}
    if room_div:
        for sp in room_div.find_all("span"):
            b = sp.find("b")  # <span>TWIN<b>2</b></span>
            if b and _int(_text(b)):
                rooms[sp.find(string=True, recursive=False).strip()] = _int(_text(b))
    # 행사 총평 입력란의 일차별 항목 id: {코드}_D_{일차}_{YYYYMMDD}
    days = [li["id"] for li in scope.find_all("li", id=re.compile(rf"^{re.escape(code)}_D_\d+_\d{{8}}$"))]
    end = start
    if days:
        y = days[-1].rsplit("_", 1)[1]
        end = date(int(y[:4]), int(y[4:6]), int(y[6:]))
    req = scope.find("a", href=re.compile(rf"customer\.hnt\?pkgCode={re.escape(code)}\b"))
    sched = scope.find("a", href=re.compile(rf"/event/schedule\.hnt\?pkgCode={re.escape(code)}\b"))
    return Tour(
        code=code,
        title=_text(link.find("span", recursive=False)),
        start=start,
        end=end,
        adult=_int(re.search(r"성인\s*(\d+)", pax).group(1)) if "성인" in pax else 0,
        child=_int(re.search(r"아동\s*(\d+)", pax).group(1)) if "아동" in pax else 0,
        infant=_int(re.search(r"유아\s*(\d+)", pax).group(1)) if "유아" in pax else 0,
        flight_from=_text(spans[0]) if spans else "",
        flight_to=_text(spans[1]) if len(spans) > 1 else "",
        flight_no=_text(air.find("b")) if air else "",
        rooms=rooms,
        requests=_int(_text(req.find("span"))) if req else 0,
        product_url=m.group(1).replace("&amp;", "&") if m else "",
        schedule_path=sched["href"] if sched else "",
    )


def parse(html):
    soup = BeautifulSoup(html, "html.parser")
    groups = {}
    for block in soup.select("section.content > div"):
        if not block.find("h2", class_="pinkTit"):
            continue
        tours = []
        for wid in block.select("ul.titList_wid"):
            hei = wid.find_next_sibling("ul", class_="titList_hei")
            if hei is None:
                continue
            # 이 행사의 룸·요청·일차 정보가 들어 있는 가장 가까운 컨테이너
            tours.append(_parse_tour(wid, hei, wid.parent))
        g = Group(sorted(tours, key=lambda t: (t.start, t.code)))
        groups.setdefault(g.codes, g)
    return sorted(groups.values(), key=lambda g: g.tours[0].start)


def brief(g):
    main = [t for t in g.tours if t.end > t.start] or g.tours
    start = min(t.start for t in g.tours)
    end = max(t.end for t in g.tours)
    a, c, i = (sum(getattr(t, k) for t in main) for k in ("adult", "child", "infant"))
    lines = [
        f"[패키지] {main[0].title.split('#')[0].strip()}",
        f"기간 {start:%m/%d}~{end:%m/%d} · 총 {a + c + i}명 (성인 {a}, 아동 {c}, 유아 {i})",
    ]
    for n, t in enumerate(g.tours, 1):
        rooms = ", ".join(f"{k} {v}" for k, v in t.rooms.items())
        air = f"{t.flight_from} → {t.flight_to} {t.flight_no}" if t.flight_no else "항공 없음"
        extra = f" 요청사항 {t.requests}건" if t.requests else ""
        lines.append(f"{n}) {t.code} {t.start:%m/%d}~{t.end:%m/%d} {t.pax}명 {air} {rooms}{extra}")
        if t not in main:
            # 부가 행사(일일투어 등) 인원은 본팀과 별개라 그날에만 더한다.
            lines.append(f"   └ 부가 행사: {t.title.split('#')[0].strip()}")
            lines.append(f"   └ {t.start:%m/%d} 당일 인원: 본팀 {a + c + i}명 + {t.pax}명 = {a + c + i + t.pax}명")
    return "\n".join(lines)


if __name__ == "__main__":
    html = open(sys.argv[1], encoding="utf-8").read()
    for g in parse(html):
        print(brief(g))
        print()
