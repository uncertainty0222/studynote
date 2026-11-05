"""
패키지 정보로 알림 메시지들을 만든다. 보내는 순서:
  1) 굵은 요약(상품명·해시태그 3개, 기간, 총인원)
  2) 예약번호별 인원·항공(가는편/오는편)
  3) 손님 명단(예약번호별, 나이 많은 순, ★ 예약자, 🎂 행사 전후 생일)
  4) 일정 요약(상품가가 가장 비싼 행사 하나의 일차별 방문지·식사, 쇼핑)
  5) 쇼핑샵 예약 문구, 식당 예약 문구
**…** 는 굵게 표시할 줄(텔레그램에서 굵게, 카카오는 기호만 지움).
"""
import re
from datetime import timedelta

import customers as customer_list
from parse_main import short_title

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


def _base_tour(group, products):
    """일정 요약 기준 행사: 일정표가 있는 행사 중 상품가가 가장 비싼 것."""
    mains = [t for t in _mains(group) if t.code in products]
    with_days = [t for t in mains if products[t.code].days]
    pool = with_days or mains
    return max(pool, key=lambda t: products[t.code].price) if pool else None


def _base_product(group, products):
    t = _base_tour(group, products)
    return products[t.code] if t else None


def _pax(t):
    parts = [f"성인 {t.adult}"]
    if t.child:
        parts.append(f"아동 {t.child}")
    if t.infant:
        parts.append(f"유아 {t.infant}")
    return f"{t.pax}명 ({', '.join(parts)})"


def _shop(n):
    return "확인 불가" if n is None else ("없음" if n == 0 else f"{n}회")


def summary_message(group, products, added=False):
    mains = _mains(group) or group.tours
    start = min(t.start for t in group.tours)
    end = max(t.end for t in group.tours)
    a, c, i = (sum(getattr(t, k) for t in mains) for k in ("adult", "child", "infant"))
    title_tour = _base_tour(group, products) or mains[0]
    return "\n".join([
        "🔔 일감 변경 (예약 추가)" if added else "🔔 새 일감",
        f"**[패키지] {short_title(title_tour.title, tags=3)}**",
        f"**기간 {start:%m/%d}~{end:%m/%d} · 총 {a + c + i}명 (성인 {a}, 아동 {c}, 유아 {i})**",
    ])


def bookings_message(group, products):
    lines = ["**예약별 인원 · 항공**"]
    mains = _mains(group)
    for t in group.tours:
        req = f" · 요청사항 {t.requests}건" if t.requests else ""
        if t not in mains:
            lines.append(f"**{t.code}** · {_pax(t)}{req}")
            lines.append(f"  {t.start:%m/%d} 부가 행사: {short_title(t.title)}")
            continue
        lines.append(f"**{t.code}** · {_pax(t)}{req}")
        legs = products[t.code].flights if t.code in products and products[t.code].flights else []
        if legs:
            lines.append(f"  가는편 {legs[0]}")
            if len(legs) > 1:
                lines.append(f"  오는편 {legs[-1]}")
        elif t.flight_no:
            lines.append(f"  항공 {t.flight_from} → {t.flight_to}  {t.flight_no}")
    # 부가 행사가 있는 날은 그날 총인원을 알려 준다.
    main_pax = sum(t.pax for t in mains)
    for t in group.tours:
        if t not in mains:
            lines.append(f"※ {t.start:%m/%d} 당일 인원: 본팀 {main_pax}명 + {t.pax}명 = {main_pax + t.pax}명")
    return "\n".join(lines)


def customers_message(group, people):
    """people: {행사코드: [Customer, ...]}. 명단을 하나도 못 읽었으면 None."""
    blocks = [customer_list.format_list(t.code, people[t.code], t.start)
              for t in group.tours if people.get(t.code)]
    if not blocks:
        return None
    return "**손님 명단** (나이 많은 순, ★ 예약자)\n" + "\n".join(blocks)


def _meal_text(meals):
    return " / ".join(f"{k} {v}" for k, v in meals.items())


def schedule_message(group, products):
    base_tour = _base_tour(group, products)
    if not base_tour:
        return "**일정 요약**\n상품페이지를 읽지 못했습니다."
    base = products[base_tour.code]
    lines = [f"**일정 요약** · 쇼핑 {_shop(base.shopping)}"]
    if len(_mains(group)) > 1:
        lines.append(f"(기준 {base_tour.code}, 상품가가 가장 높은 일정)")
    if not base.days:
        lines.append("일정표: 페이지에 없음")
    # 출발지가 여러 곳이면(인천·부산 등) 첫날 출발지와 마지막 날 도착지를 합쳐 보여 준다.
    mains_with_days = [products[t.code] for t in _mains(group)
                       if t.code in products and products[t.code].days]
    firsts = list(dict.fromkeys(p.days[0].cities.split(", ")[0] for p in mains_with_days))
    lasts = list(dict.fromkeys(p.days[-1].cities.split(", ")[-1] for p in mains_with_days))
    for d in base.days:
        cities = d.cities.split(", ")
        if d is base.days[0] and len(firsts) > 1:
            cities[0] = "·".join(firsts)
        if d is base.days[-1] and len(lasts) > 1:
            cities[-1] = "·".join(lasts)
        route = "→".join(cities)
        lines.append(f"**{d.n}일차 {d.date}** {route}")
        if d.places:
            lines.append(f"  📍 {d.places}")
        if d.shops:
            lines.append(f"  🛍 쇼핑센터 {d.shops}곳")
        if d.meals:
            lines.append(f"  🍽 {_meal_text(d.meals)}")

    return "\n".join(lines)


def shop_messages(group, products):
    """쇼핑이 있는 패키지면 문구 하나를 만든다(횟수와 관계없이 1개, 사용자가 고쳐서 쓴다).
    날짜: 일정표에 "쇼핑센터 방문"이 적힌 날, 없으면 "N박이면 N+1일차" 규칙."""
    base = _base_product(group, products)
    if not base or not base.shopping:
        return []
    mains = _mains(group)
    adult = sum(t.adult for t in mains)
    kids = sum(t.child + t.infant for t in mains)
    pax = f"{adult}+{kids}명" if kids else f"{adult}명"
    dates = [_md(d.date) for d in base.days if d.shops]
    if not dates and base.nights:
        start = min(t.start for t in mains)
        shop_day = start + timedelta(days=base.nights)  # N박 → N+1일차
        dates = [f"{shop_day.month}월 {shop_day.day}일"]
    date = ", ".join(dates) if dates else "(날짜 확인 필요)"
    return [f"안녕하세요 이사님~\n{date} {pax} {SHOP_TIME} 예약 가능할까요?"]


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


def all_messages(group, products, added=False, people=None):
    """보낼 순서대로 메시지 목록. added: 이미 알린 팀에 예약이 추가된 경우
    people: {행사코드: [Customer]} 고객정보 화면에서 읽은 손님 명단"""
    roster = customers_message(group, people or {})
    return (
        [summary_message(group, products, added), bookings_message(group, products)]
        + ([roster] if roster else [])
        + [schedule_message(group, products)]
        + shop_messages(group, products)
        + restaurant_messages(group, products)
    )
