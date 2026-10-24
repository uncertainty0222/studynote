"""
패키지 정보로 카카오톡에 보낼 문구를 만든다: 새 일감 브리핑, 쇼핑샵 예약 문구, 식당 예약 문구.
"""
import re

import brief

SHOP_TIME = "9시 30분"
RESTAURANT_MENU = "무제한 삼겹살"   # 이 메뉴가 있는 날 식당 예약 문구를 만든다
RESTAURANT_KEY = "삼겹살"


def _mains(group):
    # 일일투어 같은 부가 행사는 시작일=종료일이다.
    return [t for t in group.tours if t.end > t.start]


def _md(date_label):
    """'10/24(토)' -> '10월 24일'"""
    m, d = map(int, re.findall(r"\d+", date_label)[:2])
    return f"{m}월 {d}일"


def _base_product(group, products):
    mains = [t for t in _mains(group) if t.code in products]
    with_days = [t for t in mains if products[t.code].days]
    return products[(with_days or mains)[0].code] if mains else None


def shop_messages(group, products):
    """쇼핑 횟수만큼 같은 문구를 만든다(사용자가 보내기 전에 고친다).
    날짜는 일정표에 "쇼핑센터 방문"이 적힌 날을 순서대로 쓰고, 모자라면 확인 필요로 둔다."""
    base = _base_product(group, products)
    if not base or not base.shopping:
        return []
    mains = _mains(group)
    adult = sum(t.adult for t in mains)
    kids = sum(t.child + t.infant for t in mains)
    pax = f"{adult}+{kids}명" if kids else f"{adult}명"
    dates = [_md(d.date) for d in base.days for _ in range(d.shops)]
    out = []
    for i in range(base.shopping):
        date = dates[i] if i < len(dates) else "(날짜 확인 필요)"
        out.append(f"안녕하세요 이사님~\n{date} {pax} {SHOP_TIME} 예약 가능할까요?")
    return out


def restaurant_messages(group, products):
    base = _base_product(group, products)
    if not base:
        return []
    mains = _mains(group)
    main_pax = sum(t.pax for t in mains)
    out = []
    for day in base.days:
        for kind, menu in day.meals.items():
            if RESTAURANT_KEY not in menu:
                continue
            pax = main_pax
            # 같은 날 부가 행사 인원은 그 행사 일정에도 같은 식사가 있을 때만 더한다.
            for t in group.tours:
                if t in mains or t.code not in products:
                    continue
                for d in products[t.code].days:
                    if _md(d.date) == _md(day.date) and RESTAURANT_KEY in d.meals.get(kind, ""):
                        pax += t.pax
            out.append(f"안녕하세요 사장님~\n{_md(day.date)}에 {pax}명 {RESTAURANT_MENU} 예약 가능할까요?")
    return out


def all_messages(group, products):
    """보낼 순서대로: 브리핑, 쇼핑샵 문구, 식당 문구"""
    return (
        ["🔔 새 일감\n" + brief.package_brief(group, products)]
        + shop_messages(group, products)
        + restaurant_messages(group, products)
    )
