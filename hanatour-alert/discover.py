"""
하나투어 HAS(has.hanatour.net) 가이드 로그인 후 화면 구조를 수집하는 1단계 스크립트.

로그인 이후 페이지(일감 목록, 상세)의 구조를 파악해야 감지·브리핑 코드를 만들 수 있다.
실행하면 브라우저 창이 뜨고 자동으로 로그인한다. 사용자가 직접 일감 목록/상세 화면으로
이동한 뒤 터미널에서 Enter를 누르면 현재 화면의 스크린샷과 HTML을 dumps/ 에 저장한다.

준비:
    pip install playwright
    playwright install chromium
실행:
    python discover.py
    (법인코드, 아이디, 패스워드를 차례로 묻는다. 패스워드는 입력해도 화면에 표시되지 않는다.)
"""
import os
from getpass import getpass
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "https://has.hanatour.net/"
OUT = Path(__file__).parent / "dumps"


def login(page, corp, uid, pw):
    # 화면에는 GUIDE로 보이지만 실제 문자열은 Guide 등일 수 있어 대소문자를 무시한다.
    page.get_by_text(re.compile(r"^\s*guide\s*$", re.I)).first.click(timeout=10000)
    # GUIDE 탭에서만 법인코드 칸이 나타난다.
    corp_box = page.get_by_placeholder("법인코드")
    corp_box.wait_for(state="visible", timeout=10000)
    corp_box.fill(corp)
    page.locator('input[placeholder="아이디"]:visible').first.fill(uid)
    page.locator('input[placeholder="패스워드"]:visible').first.fill(pw)
    page.locator(':text-is("로그인"):visible').first.click()
    page.wait_for_load_state("networkidle")


def main():
    corp = os.environ.get("HANA_CORP") or input("법인코드: ")
    uid = os.environ.get("HANA_ID") or input("아이디: ")
    # 비밀번호는 화면과 명령 기록에 남지 않도록 입력 시 표시하지 않는다.
    pw = os.environ.get("HANA_PW") or getpass("패스워드(입력해도 표시되지 않음): ")
    OUT.mkdir(exist_ok=True)

    with sync_playwright() as p:
        # 기본 1280x720 고정 화면이면 팝업 닫기 버튼이 잘린다. 창 크기를 따르도록 한다.
        browser = p.chromium.launch(headless=False, args=["--start-maximized"])
        page = browser.new_page(no_viewport=True)
        page.goto(URL, wait_until="networkidle")

        try:
            login(page, corp, uid, pw)
        except Exception as e:
            # 자동 로그인이 실패해도 수집은 계속할 수 있게 한다.
            (OUT / "login_page.html").write_text(page.content(), encoding="utf-8")
            print("자동 로그인 실패:", type(e).__name__, str(e).splitlines()[0])
            print("로그인 화면 HTML을 dumps/login_page.html 에 저장했습니다.")
            input("브라우저에서 직접 GUIDE 탭을 눌러 로그인한 뒤 Enter: ")
        print("로그인 후 URL:", page.url)

        n = 0
        while True:
            cmd = input("저장하려면 Enter, 종료하려면 q 입력: ").strip().lower()
            if cmd == "q":
                break
            n += 1
            stem = OUT / f"{n:02d}_{time.strftime('%H%M%S')}"
            page.screenshot(path=f"{stem}.png", full_page=True)
            Path(f"{stem}.html").write_text(page.content(), encoding="utf-8")
            Path(f"{stem}.url.txt").write_text(page.url, encoding="utf-8")
            print("저장:", stem)

        browser.close()


if __name__ == "__main__":
    main()
