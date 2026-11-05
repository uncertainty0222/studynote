"""
하나투어 상품페이지(m.hanatour.com/trp/pkg/...) HTML에서 쇼핑 횟수와 일차별 식사를 뽑는다.

화면 구조(2026-10 기준):
  dt[id^=schedule_day] .schedule_day > strong "N일차", span "MM/DD(요일)"
  바로 뒤 dd .schedule_meal > p > span(조식|중식|석식) + strong(메뉴)
  div.pkg_shopping p em "N회"   (쇼핑 없는 상품은 이 블록이 없고 "쇼핑없음" 표시)

사용:
    python parse_product.py dumps/auto_product_XXXX.html
"""
import re
import sys
from dataclasses import dataclass

from bs4 import BeautifulSoup


@dataclass
class Day:
    n: int
    date: str
    meals: dict  # {"조식": "호텔식", ...}
    shops: int = 0  # 이 날 일정에 적힌 "쇼핑센터" 방문 수
    cities: str = ""  # "나트랑, 달랏"
    places: str = ""  # "달랏 기차역, 다딴라 폭포, ..." (선택관광·간식 제외 방문지)


@dataclass
class Leg:
    dep: str        # "PUS"
    dep_time: str   # "19:20"
    arr: str
    arr_time: str
    next_day: bool  # 도착이 +1일
    flight: str     # "BX0781"

    def __str__(self):
        plus = "+1" if self.next_day else ""
        return f"{self.dep} {self.dep_time} → {self.arr} {self.arr_time}{plus}  {self.flight}"


@dataclass
class Product:
    code: str
    shopping: int | None  # None: 페이지에서 확인 불가
    days: list
    nights: int | None = None  # "3박 5일"의 3
    flights: list = None  # [가는편 Leg, ..., 오는편 Leg]
    price: int = 0  # 성인 1인 상품가(원)


def parse(html):
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    m = re.search(r"\bA[A-Z]{2}\w{12}\b", text)
    code = m.group() if m else ""

    shop = soup.select_one("div.pkg_shopping em")
    if shop:
        shopping = int(re.search(r"\d+", shop.get_text()).group())
    elif "쇼핑없음" in text or "NO쇼핑" in text:
        shopping = 0
    else:
        shopping = None

    days = []
    for dt in soup.select("dt[id^=schedule_day]"):
        head = dt.select_one(".schedule_day")
        if not head:
            continue
        n = int(re.search(r"\d+", head.find("strong").get_text()).group())
        date = head.find("span").get_text(strip=True)
        dd = dt.find_next_sibling("dd")
        meals = {}
        for p in dd.select(".schedule_meal p") if dd else []:
            kind, menu = p.find("span"), p.find("strong")
            if kind and menu:
                meals[kind.get_text(strip=True)] = " ".join(menu.get_text(" ", strip=True).split())
        loc = dt.select_one(".schedule_location")
        cities = loc.find("strong").get_text(strip=True) if loc and loc.find("strong") else ""
        places = ", ".join(_places(dd)) if dd else ""
        body = dd.get_text(" ", strip=True) if dd else ""
        shops = len(re.findall(r"쇼핑\s*센터\s*방문", body))
        days.append(Day(n, date, meals, shops, cities, places))
    m = re.search(r"(\d+)\s*박\s*\d+\s*일", text)
    nights = int(m.group(1)) if m else None
    price_el = soup.select_one("div.sche_price span.data")
    m = re.search(r"\d[\d,]*", price_el.get_text()) if price_el else None
    price = int(m.group().replace(",", "")) if m else 0  # "29,900원~" 처럼 범위면 첫 금액
    return Product(code, shopping, days, nights, _flights(soup), price)


# 방문지 카드와 같은 형식으로 나오지만 장소가 아닌 것(간식·식사·안내)
NOT_PLACE = re.compile(r"식사|커피|주스|쥬스|튀김|도시락|정식|간식|라운지|껨보|반미|아이스크림|안내|확인 사항")


def _places(dd):
    """일차별 방문지 이름. 선택관광 카드와 간식(★…제공★) 카드는 뺀다."""
    names = []
    for card in dd.select(".card_mngr.type2, .card_mngr.type3"):
        tit = card.select_one("._tit")
        if not tit:
            continue
        states = [x.get_text(strip=True) for x in card.select(".tag_group .state")]
        note = card.select_one(".custom_tag_b")
        note = note.get_text(" ", strip=True) if note else ""
        name = (tit.find("a") or tit).get_text(" ", strip=True)
        name = re.sub(r"^(스페셜포함|선택관광|MD추천)\s*", "", name).strip()
        snack = ("제공" in note or "★" in note) and "스페셜포함" not in states
        if "선택관광" in states or snack or NOT_PLACE.search(name):
            continue
        if name and name not in names:
            names.append(name)
    return names


def _flights(soup):
    """일정표 안의 항공 구간: div.route_detail ul.path > li(출발), li(도착)"""
    legs = []
    for path in soup.select("div.route_detail ul.path"):
        items = path.find_all("li", recursive=False)
        if len(items) < 2:
            continue
        dep, arr = items[0], items[-1]
        dep_spot = dep.select_one(".spot strong").get_text(" ", strip=True)
        arr_spot = arr.select_one(".spot strong").get_text(" ", strip=True)
        air = dep.select_one(".air_name")
        flight = re.search(r"[A-Z0-9]{2}\d{3,4}", air.get_text(" ", strip=True)) if air else None
        code = lambda spot: (re.search(r"\(([A-Z]{3})\)", spot) or re.search(r"(\S+)", spot)).group(1)
        legs.append(Leg(
            dep=code(dep_spot),
            dep_time=dep.select_one(".start_time strong").get_text(strip=True),
            arr=code(arr_spot),
            arr_time=arr.select_one(".start_time strong").get_text(strip=True),
            next_day="+1" in arr_spot,
            flight=flight.group() if flight else "",
        ))
    return legs


def brief(p):
    if p.shopping is None:
        shop = "쇼핑: 확인 불가"
    else:
        shop = "쇼핑: 없음" if p.shopping == 0 else f"쇼핑: {p.shopping}회"
    lines = [shop]
    if not p.days:
        lines.append("일정표: 페이지에 없음(로딩 전 저장된 것으로 보임)")
    for d in p.days:
        parts = [f"{k} {v}" for k, v in d.meals.items()]
        if d.shops:
            parts.append(f"쇼핑센터 {d.shops}곳")
        lines.append(f"{d.n}일차 {d.date}: {' / '.join(parts)}")
    return "\n".join(lines)


if __name__ == "__main__":
    for path in sys.argv[1:]:
        p = parse(open(path, encoding="utf-8").read())
        print(f"== {p.code}")
        print(brief(p))
        print()
