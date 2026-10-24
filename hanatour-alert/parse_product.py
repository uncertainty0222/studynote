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


@dataclass
class Product:
    code: str
    shopping: int | None  # None: 페이지에서 확인 불가
    days: list


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
        body = dd.get_text(" ", strip=True) if dd else ""
        shops = len(re.findall(r"쇼핑\s*센터\s*방문", body))
        days.append(Day(n, date, meals, shops))
    return Product(code, shopping, days)


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
