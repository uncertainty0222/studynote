"""
새 일감·배정 변경 감시: 로그인 → 메인 화면 분석 → 지난 실행과 비교(changes.py)해서
새 팀이나 바뀐 팀만 손님 명단·상품페이지를 읽어 브리핑·쇼핑샵·식당 예약 문구를 텔레그램·카카오톡(설정된 것 모두)으로 보낸다.

    python monitor.py          평소 실행(작업 스케줄러가 오전 9시, 오후 5시에 실행)
    python monitor.py --dry    보내지 않고 화면에만 출력, 확인한 행사로 기록하지도 않음
    python monitor.py --all    지금 있는 모든 패키지를 새 일감처럼 처리(전송 테스트용)
    python monitor.py --init-checklist   지금 배정된 팀을 예약 체크·현황판에만 등록(처음 한 번)
    python monitor.py --show 행사코드    그 행사가 속한 팀의 상세 정보를 지금 읽어 보냄(텔레그램 /일감 에서 사용)

처음 실행하면 지금 있는 행사들을 "이미 본 것"으로 기록만 하고 시작 알림을 보낸다.
"""
import json
import sys
import time
import traceback
from datetime import date
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright

import changes
import checklist
import creds
import customers
import discover
import notify
import messages
import parse_main
import parse_product
import telegram

HERE = Path(__file__).parent
SEEN_FILE = HERE / "seen_codes.json"   # 예전 버전의 기록(행사코드만). state.json 이 없을 때만 읽는다.
STATE_FILE = HERE / "state.json"       # 지난 실행 때의 행사별 출발일·인원
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
    """메인 화면을 분석하고, want_products 가 고른 행사들의 손님 명단과 상품페이지를 읽는다."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(discover.URL, wait_until="networkidle")
        discover.login(page, corp, uid, pw)
        main_html = page.content()
        groups = parse_main.parse(main_html)
        targets = want_products(groups)
        # 손님 명단(고객정보 화면)을 먼저 읽는다. HAS 로그인 상태에서만 열린다.
        people = {}
        for t in targets:
            if not t.customer_path:
                continue
            try:
                page.goto(urljoin(discover.URL, t.customer_path), wait_until="networkidle")
                people[t.code] = customers.parse(page.content())
            except Exception as e:
                log(f"고객정보 실패 {t.code}: {type(e).__name__}")
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
    return groups, products, people


def main():
    dry = "--dry" in sys.argv
    send_all = "--all" in sys.argv
    # 지금 배정된 팀들을 예약 체크(현황판)에만 등록하고 브리핑은 다시 보내지 않는다.
    init_checklist = "--init-checklist" in sys.argv
    # --show 행사코드: 그 행사가 속한 팀의 상세 정보만 지금 HAS 에서 읽어 보낸다(기록은 바꾸지 않음).
    show = sys.argv[sys.argv.index("--show") + 1] if "--show" in sys.argv else None
    prev = changes.load(STATE_FILE, SEEN_FILE)
    first_run = prev is None and not send_all
    today = date.today()
    plan = {}

    def want(groups):
        """알릴 팀을 정하고, 그 팀들의 행사만 손님 명단·상품페이지를 읽는다."""
        if show:
            plan["teams"] = [changes.TeamChange(g, new_team=True) for g in groups if show in g.codes]
            plan["cancelled"] = []
        elif init_checklist:
            plan["teams"] = [changes.TeamChange(g, new_team=True) for g in groups]
            plan["cancelled"] = []
        elif first_run:
            plan["teams"], plan["cancelled"] = [], []
        elif send_all:
            plan["teams"] = [changes.TeamChange(g, new_team=True) for g in groups]
            plan["cancelled"] = []
        else:
            plan["teams"], plan["cancelled"] = changes.diff(prev, groups, today)
        return [t for c in plan["teams"] for t in c.group.tours]

    corp, uid, pw = creds.load()
    for attempt in range(1, NET_RETRIES + 1):
        try:
            groups, products, people = fetch(corp, uid, pw, want)
            break
        except Exception as e:
            # 인터넷 끊김, 로그인 화면 대신 점검 안내 등이 잠깐 뜬 경우는 기다렸다 다시 시도한다.
            retryable = "net::ERR_" in str(e) or "로그인 화면이 아닙니다" in str(e)
            if not retryable or attempt == NET_RETRIES:
                raise
            log(f"접속 문제, {NET_WAIT}초 후 다시 시도 ({attempt}/{NET_RETRIES}): {str(e).splitlines()[0]}")
            time.sleep(NET_WAIT)

    def save():
        # 전송이 끝난 뒤에 기록해야 실패 시 다음 실행에서 다시 보낸다.
        if not dry:
            STATE_FILE.write_text(json.dumps(changes.snapshot(groups), ensure_ascii=False, indent=1),
                                  encoding="utf-8")

    def send(msg):
        if dry:
            print(msg, "\n---")
        else:
            notify.send(msg)

    if show:
        if not plan["teams"]:
            send(f"{show} 행사가 지금 HAS 화면에 없습니다(끝났거나 배정에서 빠졌을 수 있음).")
        for c in plan["teams"]:
            msgs = messages.all_messages(c.group, products, None, people)
            msgs[0] = "📄 일감 상세" + msgs[0][msgs[0].index("\n"):]  # 첫 줄 "🔔 새 일감" 대신
            for msg in msgs:
                send(msg)
        return

    if init_checklist:
        for c in plan["teams"]:
            checklist.update_team(c.group, products)
        checklist.refresh_board()
        log(f"예약 체크 등록: {len(plan['teams'])}팀")
        return

    if first_run:
        text = f"하나투어 일감 알림을 시작합니다.\n현재 배정된 패키지 {len(groups)}건을 기록했습니다."
        log(text.replace("\n", " "))
        send(text)
        save()
        return

    teams, cancelled = plan["teams"], plan["cancelled"]
    new = sum(c.new_team for c in teams)
    log(f"패키지 {len(groups)}건, 새 일감 {new}건, 변경 {len(teams) - new}건, 취소 {len(cancelled)}건")
    for c in teams:
        for msg in messages.all_messages(c.group, products, c, people):
            send(msg)
    for team in cancelled:
        send(changes.cancel_message(team))
    save()
    if not dry and telegram.configured():
        update_checklist(teams, cancelled, products)


def update_checklist(teams, cancelled, products):
    """예약 체크: 바뀐 팀 등록/갱신, 빠진 팀 정리, 현황판 갱신, 오전 실행이면 D-3 독촉.
    여기서 실패해도 일감 알림 자체는 이미 끝났으므로 기록만 남긴다."""
    try:
        for c in teams:
            checklist.update_team(c.group, products)
        for team in cancelled:
            checklist.cancel_team(min(changes.code_start(code, info) for code, info in team))
        checklist.refresh_board()
        if time.localtime().tm_hour < 12:
            checklist.remind()
    except Exception as e:
        log("예약 체크 갱신 실패: " + "".join(traceback.format_exception_only(e)).strip())


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
