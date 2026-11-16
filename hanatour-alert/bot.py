"""
텔레그램 버튼(예약 체크)을 바로 처리하는 상주 프로그램. PC에 로그인하면 작업 스케줄러가 켠다.

    pythonw bot.py      창 없이 실행(작업 스케줄러용)
    python bot.py       확인용으로 직접 실행(Ctrl+C 로 종료)

텔레그램 서버에 새 버튼 누름이 있는지 묻고(최대 50초 대기), 오면 checklist.handle_callback() 으로 처리한다.
인터넷이 끊기면 잠시 쉬었다가 다시 시도한다. 기록은 bot.log.
"""
import json
import time
import traceback
from pathlib import Path

import checklist
import telegram

HERE = Path(__file__).parent
OFFSET_FILE = HERE / "bot_offset.json"
LOG_FILE = HERE / "bot.log"


def log(msg):
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    try:
        print(msg)
    except Exception:
        pass


def main():
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
            try:
                checklist.handle_callback(query)
            except Exception:
                log("버튼 처리 오류: " + traceback.format_exc().splitlines()[-1])


if __name__ == "__main__":
    main()
