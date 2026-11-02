"""
저장된 화면으로 알림 메시지를 미리 본다(전송하지 않음).

사용:
    python brief.py dumps
    (dumps/auto_main.html 과 dumps/auto_product_<행사코드>.html 을 읽는다)
"""
import sys
from pathlib import Path

import messages
import parse_main
import parse_product


def load_products(folder):
    products = {}
    for f in Path(folder).glob("auto_product_*.html"):
        p = parse_product.parse(f.read_text(encoding="utf-8"))
        products[f.stem.removeprefix("auto_product_")] = p
    return products


def main(folder):
    groups = parse_main.parse((Path(folder) / "auto_main.html").read_text(encoding="utf-8"))
    products = load_products(folder)
    for g in groups:
        for m in messages.all_messages(g, products):
            print(m)
            print("-" * 30)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "dumps")
