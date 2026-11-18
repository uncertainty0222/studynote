"""
텔레그램 버튼(예약 체크)을 바로 처리하는 상주 프로그램. PC에 로그인하면 작업 스케줄러가 켠다.

    pythonw bot.py      창 없이 실행(작업 스케줄러용)
    python bot.py       확인용으로 직접 실행(Ctrl+C 로 종료)

텔레그램 서버에 새 버튼 누름이 있는지 묻고(최대 50초 대기), 오면 checklist.handle_callback() 으로 처리한다.
인터넷이 끊기면 잠시 쉬었다가 다시 시도한다. 기록은 bot.log.
"""
import json
import socket
import sys
import time
import traceback
from pathlib import Path

import checklist
import telegram

HERE = Path(__file__).parent
OFFSET_FILE = HERE / "bot_offset.json"
LOG_FILE = HERE / "bot.log"
SINGLE_PORT = 47321  # 이미 실행 중인지 확인하는 용도(이 PC 안에서만 쓰는 포트)


def log(msg):
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    try:
        print(msg)
    except Exception:
        pass


def already_running():
    """봇이 두 개 켜지면 텔레그램이 409 Conflict 로 거절하므로, 하나만 켜지게 한다.
    포트를 잡아 두는 방식이라 프로그램이 꺼지면 자동으로 풀린다."""
    global _guard
    _guard = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        _guard.bind(("127.0.0.1", SINGLE_PORT))
        return False
    except OSError:
        return True


def main():
    if already_running():
        print("봇이 이미 실행 중입니다(작업 스케줄러 HanatourBot). 이 창은 종료합니다.")
        sys.exit(0)
    offset = json.loads(OFFSET_FILE.read_text()) if OFFSET_FILE.exists() else None
    log("봇 시작")
    while True:
        try:
            updates = telegram.call("getUpdates", offset=offset, timeout=50,
                                    allowed_updates=["callback_query"])
        except Exception as e:
            log(f"연결 오류, 30초 후 다시 시도: {str(e)[:150]}")
            time.sleep(30)
            continue
        for u in updates:
            offset = u["update_id"] + 1
            OFFSET_FILE.write_text(json.dumps(offset))
            query = u.get("callback_query")
            # 설정된 내 채팅에서 온 것만 처리한다.
            if not query or query.get("from", {}).get("id") != telegram.chat_id():
                continue
            pressed_at = time.strftime("%m/%d %H:%M:%S", time.localtime(query.get("message", {}).get("date", 0)))
            log(f"버튼: {query.get('data')} (메시지 {query.get('message', {}).get('message_id')}, 메시지 시각 {pressed_at})")
            try:
                checklist.handle_callback(query)
            except Exception:
                log("버튼 처리 오류: " + traceback.format_exc().splitlines()[-1])


if __name__ == "__main__":
    main()
