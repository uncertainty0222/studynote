"""
손님 명단 메시지.

규칙:
  - 나이 많은 순으로 나열, 나이는 행사 시작일 기준 만 나이
  - HAS 고객정보 화면에서 첫 번째로 나온 사람에게 ★ (예약자일 가능성이 높음)
  - 생일이 행사 시작일 앞뒤 15일 안이면 🎂 날짜 표시
고객정보 화면을 읽는 parse() 는 화면 구조를 확인한 뒤 추가한다.
"""
from dataclasses import dataclass
from datetime import date, timedelta

BIRTHDAY_WINDOW = 15  # 행사 시작일 앞뒤 일수


@dataclass
class Customer:
    name: str
    gender: str     # "남" / "여" / ""
    birth: date | None
    order: int      # HAS 화면에 나온 순서(0부터)


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
        star = "★" if c.order == 0 else ""
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
