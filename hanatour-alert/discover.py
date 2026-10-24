"""
하나투어 HAS(has.hanatour.net) 가이드 로그인 후 화면 구조를 수집하는 1단계 스크립트.

로그인 이후 페이지(일감 목록, 상세)의 구조를 파악해야 감지·브리핑 코드를 만들 수 있다.
실행하면 브라우저 창이 뜨고 자동으로 로그인한다. 사용자가 직접 일감 목록/상세 화면으로
이동한 뒤 터미널에서 Enter를 누르면 현재 화면의 스크린샷과 HTML을 dumps/ 에 저장한다.

준비:
    pip install playwright
    playwright install chromium
실행 (macOS/Linux):
    HANA_CORP=법인코드 HANA_ID=아이디 HANA_PW=비밀번호 python discover.py
실행 (Windows PowerShell):
    $env:HANA_CORP="법인코드"; $env:HANA_ID="아이디"; $env:HANA_PW="비밀번호"; python discover.py
"""
import os
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "https://has.hanatour.net/"
OUT = Path(__file__).parent / "dumps"


def main():
    corp, uid, pw = (os.environ.get(k) for k in ("HANA_CORP", "HANA_ID", "HANA_PW"))
    if not all((corp, uid, pw)):
        raise SystemExit("HANA_CORP, HANA_ID, HANA_PW 환경변수를 설정하세요.")
    OUT.mkdir(exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(URL, wait_until="networkidle")

        # 로그인 화면: TC / GUIDE 탭, 입력칸은 placeholder 문구로 찾는다.
        page.get_by_text("GUIDE", exact=True).click()
        page.get_by_placeholder("법인코드").fill(corp)
        page.get_by_placeholder("아이디").fill(uid)
        page.get_by_placeholder("패스워드").fill(pw)
        page.get_by_role("button", name="로그인").click()
        page.wait_for_load_state("networkidle")
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
