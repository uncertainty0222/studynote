"""
손님 명단 메시지.

규칙:
  - 나이 많은 순으로 나열, 나이는 행사 시작일 기준 만 나이
  - 예약자에게 ★: 화면에서 이름 옆에 빨간 * 가 붙은 사람, 없으면 첫 번째로 나온 사람
  - 생일이 행사 시작일 앞뒤 15일 안이면 🎂 날짜 표시

고객정보 화면(customer.hnt) 구조(2026-11 기준):
  ul.personList > li                     손님 1명
    span[data-customer-field=resKname]   이름 (화면 글자는 가려져 있고 data-unmasked-value 에 원래 값)
    span[data-customer-field=birthday]   생년월일 "YYYY.MM.DD"
    span[data-customer-field=sex]        "남" / "여"
    sup.c_red                            예약자 표시(*)
  전화번호(hpNo)는 읽지 않는다.
"""
import re
from dataclasses import dataclass
from datetime import date

from bs4 import BeautifulSoup

BIRTHDAY_WINDOW = 15  # 행사 시작일 앞뒤 일수


@dataclass
class Customer:
    name: str
    gender: str     # "남" / "여" / ""
    birth: date | None
    order: int      # HAS 화면에 나온 순서(0부터)
    booker: bool = False


def _field(li, name):
    el = li.select_one(f'[data-customer-field="{name}"]')
    if not el:
        return ""
    return (el.get("data-unmasked-value") or el.get_text()).strip()


def parse(html):
    soup = BeautifulSoup(html, "html.parser")
    people = []
    for n, li in enumerate(soup.select("ul.personList > li")):
        name = _field(li, "resKname")
        if not name:
            continue
        m = re.fullmatch(r"(\d{4})\.(\d{2})\.(\d{2})", _field(li, "birthday"))
        birth = date(*map(int, m.groups())) if m else None
        people.append(Customer(name, _field(li, "sex"), birth, n, bool(li.select_one("sup.c_red"))))
    if people and not any(p.booker for p in people):
        people[0].booker = True
    return people


def age_on(birth, day):
    """day 기준 만 나이"""
    return day.year - birth.year - ((day.month, day.day) < (birth.month, birth.day))


def birthday_near(birth, start):
    """start 앞뒤 BIRTHDAY_WINDOW일 안에 생일이 있으면 그 날짜, 없으면 None"""
    for year in (start.year - 1, start.year, start.year + 1):
        try:
            bday = birth.replace(year=year)
        except ValueError:  # 2/29 생일
            bday = date(year, 3, 1)
        if abs((bday - start).days) <= BIRTHDAY_WINDOW:
            return bday
    return None


def format_list(code, customers, start):
    lines = [f"**{code}**"]
    ordered = sorted(customers, key=lambda c: (c.birth or date.max, c.order))
    for n, c in enumerate(ordered, 1):
        star = "★" if c.booker else ""
        parts = [f"{star}{c.name}"]
        if c.gender:
            parts.append(c.gender)
        if c.birth:
            parts.append(f"{c.birth:%Y.%m.%d} ({age_on(c.birth, start)}세)")
        line = f"{n}. " + " · ".join(parts)
        bday = birthday_near(c.birth, start) if c.birth else None
        if bday:
            line += f" 🎂 {bday.month}/{bday.day}"
        lines.append(line)
    return "\n".join(lines)
