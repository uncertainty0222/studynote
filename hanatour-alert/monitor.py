"""
새 일감 감시: 로그인 → 메인 화면 분석 → 처음 보는 행사코드가 있는 패키지만
상품페이지를 읽어 브리핑·쇼핑샵·식당 예약 문구를 텔레그램·카카오톡(설정된 것 모두)으로 보낸다.

    python monitor.py          평소 실행(작업 스케줄러가 오전 9시, 오후 5시에 실행)
    python monitor.py --dry    보내지 않고 화면에만 출력, 확인한 행사로 기록하지도 않음
    python monitor.py --all    지금 있는 모든 패키지를 새 일감처럼 처리(전송 테스트용)

처음 실행하면 지금 있는 행사들을 "이미 본 것"으로 기록만 하고 시작 알림을 보낸다.
"""
import json
import sys
import time
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright

import creds
import discover
import notify
import messages
import parse_main
import parse_product

HERE = Path(__file__).parent
SEEN_FILE = HERE / "seen_codes.json"
LOG_FILE = HERE / "monitor.log"
NET_RETRIES = 4   # 인터넷 연결 오류 시 시도 횟수
NET_WAIT = 60     # 다시 시도하기 전 대기(초)


# 작업 스케줄러에서 출력이 파일로 넘어가면 Windows 기본 인코딩(cp1252 등)이 쓰여
# 한글 print 에서 UnicodeEncodeError 로 죽는다. 출력 인코딩을 UTF-8 로 고정한다.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def log(msg):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    # 기록 파일을 먼저 쓴다. 화면 출력이 실패해도 기록은 남아야 한다.
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    try:
        print(line)
    except Exception:
        pass


def fetch(corp, uid, pw, want_products):
    """메인 화면 HTML과, want_products(그룹 → 행사코드 목록)에 해당하는 상품페이지 HTML을 가져온다."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(discover.URL, wait_until="networkidle")
        discover.login(page, corp, uid, pw)
        main_html = page.content()
        groups = parse_main.parse(main_html)
        targets = want_products(groups)
        products = {}
        for t in targets:
            if not t.product_url:
                continue
            try:
                page.goto(t.product_url, wait_until="networkidle")
                shown = discover.wait_itinerary(page)
                products[t.code] = parse_product.parse(shown.content())
            except Exception as e:
                log(f"상품페이지 실패 {t.code}: {type(e).__name__}")
        browser.close()
    return groups, products


def main():
    dry = "--dry" in sys.argv
    send_all = "--all" in sys.argv
    seen = set(json.loads(SEEN_FILE.read_text(encoding="utf-8"))) if SEEN_FILE.exists() else None
    first_run = seen is None and not send_all

    def new_groups(groups):
        if first_run:
            return []
        return [g for g in groups if send_all or not g.codes <= seen]

    corp, uid, pw = creds.load()
    want = lambda gs: [t for g in new_groups(gs) for t in g.tours]
    # PC가 절전에서 깨어난 직후처럼 인터넷이 아직 안 붙었을 때(net::ERR_...)는 잠시 기다렸다 다시 시도한다.
    for attempt in range(1, NET_RETRIES + 1):
        try:
            groups, products = fetch(corp, uid, pw, want)
            break
        except Exception as e:
            if "net::ERR_" not in str(e) or attempt == NET_RETRIES:
                raise
            log(f"인터넷 연결 오류, {NET_WAIT}초 후 다시 시도 ({attempt}/{NET_RETRIES}): {str(e).splitlines()[0]}")
            time.sleep(NET_WAIT)
    todo = new_groups(groups)
    all_codes = set().union(*(g.codes for g in groups)) if groups else set()

    if first_run:
        text = f"하나투어 일감 알림을 시작합니다.\n현재 배정된 패키지 {len(groups)}건을 기록했습니다."
        log(text.replace("\n", " "))
        if not dry:
            notify.send(text)
            SEEN_FILE.write_text(json.dumps(sorted(all_codes)), encoding="utf-8")
        return

    log(f"패키지 {len(groups)}건, 새 일감 {len(todo)}건")
    for g in todo:
        added = bool(seen and g.codes & seen)
        for msg in messages.all_messages(g, products, added):
            if dry:
                print(msg, "\n---")
            else:
                notify.send(msg)
    if not dry:
        # 전송이 끝난 뒤에 기록해야 실패 시 다음 실행에서 다시 보낸다.
        SEEN_FILE.write_text(json.dumps(sorted(all_codes | (seen or set()))), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log("오류: " + "".join(traceback.format_exception_only(e)).strip())
        if "--dry" not in sys.argv:
            try:
                notify.send(f"⚠️ 하나투어 일감 확인 실패\n{type(e).__name__}: {str(e)[:120]}\n로그: monitor.log")
            except Exception:
                log("오류 알림 전송도 실패: " + traceback.format_exc().splitlines()[-1])
        raise
