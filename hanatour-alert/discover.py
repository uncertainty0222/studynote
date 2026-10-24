"""
하나투어 HAS(has.hanatour.net) 가이드 로그인 후 화면 구조를 수집하는 1단계 스크립트.

로그인 이후 페이지(일감 목록, 상세)의 구조를 파악해야 감지·브리핑 코드를 만들 수 있다.
실행하면 브라우저 창이 뜨고 자동으로 로그인한다. 사용자가 직접 일감 목록/상세 화면으로
이동한 뒤 터미널에서 Enter를 누르면 현재 화면의 스크린샷과 HTML을 dumps/ 에 저장한다.

준비:
    pip install playwright keyring beautifulsoup4
    playwright install chromium
실행:
    python discover.py           처음 한 번만 로그인 정보를 묻고, 성공하면 저장한다.
    python discover.py --reset   저장된 로그인 정보를 지우고 다시 입력한다.
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

import creds

URL = "https://has.hanatour.net/"
OUT = Path(__file__).parent / "dumps"


def login(page, corp, uid, pw):
    # 로그인 폼 구조(login.hnt):
    #   TC/GUIDE 탭 = radio name=empTyp (value tc|guide), 화면에 보이는 것은 꾸며진 label
    #   법인코드 = compCode (placeholder 없음), 아이디 = empCode, 패스워드 = hpwd, 버튼 = #loginBtn
    # 버튼을 누르면 폼 전체를 /loginProc.hnt 로 보내므로 값만 정확히 넣으면 된다.
    messages = []

    def on_dialog(d):
        messages.append(d.message)
        d.accept()

    page.on("dialog", on_dialog)
    page.evaluate(
        """([corp, uid, pw]) => {
            const f = document.querySelector('#loginFrm');
            f.querySelector('input[name=empTyp][value=guide]').checked = true;
            f.querySelector('input[name=compCode]').value = corp;
            f.querySelector('input[name=empCode]').value = uid;
            f.querySelector('input[name=hpwd]').value = pw;
        }""",
        [corp, uid, pw],
    )
    page.locator("#loginBtn").click()
    try:
        page.wait_for_url("**/main*", timeout=15000)
    except Exception:
        raise RuntimeError("로그인 후 메인으로 이동하지 않음. 사이트 메시지: " + (" / ".join(messages) or "없음"))
    finally:
        page.remove_listener("dialog", on_dialog)
    page.wait_for_load_state("networkidle")


def main():
    reset = "--reset" in sys.argv
    if reset:
        creds.forget()
    corp, uid, pw = creds.load(reset)
    OUT.mkdir(exist_ok=True)

    with sync_playwright() as p:
        # 기본 1280x720 고정 화면이면 팝업 닫기 버튼이 잘린다. 창 크기를 따르도록 한다.
        browser = p.chromium.launch(headless=False, args=["--start-maximized"])
        page = browser.new_page(no_viewport=True)
        page.goto(URL, wait_until="networkidle")

        try:
            login(page, corp, uid, pw)
            creds.save(corp, uid, pw)
        except Exception as e:
            # 자동 로그인이 실패해도 수집은 계속할 수 있게 한다.
            (OUT / "login_page.html").write_text(page.content(), encoding="utf-8")
            print("자동 로그인 실패:", type(e).__name__, str(e).splitlines()[0])
            print("로그인 화면 HTML을 dumps/login_page.html 에 저장했습니다.")
            print("저장된 비밀번호가 바뀌었다면 python discover.py --reset 으로 다시 입력하세요.")
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
