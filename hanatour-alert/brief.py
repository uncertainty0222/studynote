"""
메인 화면과 상품페이지 저장본을 합쳐 패키지별 브리핑을 만든다.

  - 공동행사로 묶인 행사들은 일정이 같다고 보고, 대표 행사 하나의 쇼핑·식사를 보여 준다.
  - 다른 행사의 쇼핑 횟수나 일차별 식사가 대표와 다르면 "차이"로 덧붙인다.
  - 일일투어 같은 부가 행사는 식사 비교에서 뺀다.

사용:
    python brief.py dumps
    (dumps/auto_main.html 과 dumps/auto_product_<행사코드>.html 을 읽는다)
"""
import sys
from pathlib import Path

import parse_main
import parse_product


def load_products(folder):
    products = {}
    for f in Path(folder).glob("auto_product_*.html"):
        p = parse_product.parse(f.read_text(encoding="utf-8"))
        products[f.stem.removeprefix("auto_product_")] = p
    return products


def _meals(p):
    return {d.n: (d.date, d.meals) for d in p.days}


def package_brief(group, products):
    lines = [parse_main.brief(group)]
    # 부가 행사(당일 행사)는 제외하고, 일정표가 있는 행사를 대표로 삼는다.
    mains = [t for t in group.tours if t.end > t.start and t.code in products]
    with_days = [t for t in mains if products[t.code].days]
    if not mains:
        lines.append("쇼핑·식사: 상품페이지 저장본 없음")
        return "\n".join(lines)
    base_tour = (with_days or mains)[0]
    base = products[base_tour.code]

    lines.append("")
    lines.append(f"[일정] 기준 {base_tour.code}")
    lines.append(parse_product.brief(base))

    diffs = []
    for t in mains:
        if t is base_tour:
            continue
        other = products[t.code]
        if other.shopping != base.shopping:
            diffs.append(f"{t.code} 쇼핑 {_shop(other.shopping)} (기준 {_shop(base.shopping)})")
        if not other.days:
            if base.days:
                diffs.append(f"{t.code} 일정표 없음 - 식사 비교 불가")
            continue
        bm, om = _meals(base), _meals(other)
        for n in sorted(set(bm) | set(om)):
            b_meals = bm.get(n, ("", {}))[1]
            o_meals = om.get(n, ("", {}))[1]
            for kind in ("조식", "중식", "석식"):
                if b_meals.get(kind) != o_meals.get(kind):
                    diffs.append(
                        f"{t.code} {n}일차 {kind}: {o_meals.get(kind, '없음')}"
                        f" (기준 {b_meals.get(kind, '없음')})"
                    )
    if diffs:
        lines.append("")
        lines.append("[차이]")
        lines += [f"- {d}" for d in diffs]
    return "\n".join(lines)


def _shop(n):
    return "확인 불가" if n is None else ("없음" if n == 0 else f"{n}회")


def main(folder):
    groups = parse_main.parse((Path(folder) / "auto_main.html").read_text(encoding="utf-8"))
    products = load_products(folder)
    print("\n\n".join(package_brief(g, products) for g in groups))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "dumps")
