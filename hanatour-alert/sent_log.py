"""
팀별로 마지막에 보낸 상세 알림(새 일감·변경·상세 보기)의 텔레그램 메시지 번호를 기억한다.
/list 의 [N번 상세] 버튼을 누르면 HAS 에서 다시 읽지 않고, 그 알림에 답장을 달아
인용을 누르면 원래 알림으로 바로 이동하게 한다.
"""
import json
import time
from pathlib import Path

FILE = Path(__file__).parent / "sent_messages.json"
KEEP_DAYS = 120


def _load():
    return json.loads(FILE.read_text(encoding="utf-8")) if FILE.exists() else {}


def record(codes, ids):
    """팀의 모든 행사코드에 대해 첫 메시지(요약) 번호를 기록한다."""
    if not ids:
        return
    data = _load()
    now = time.time()
    for code in codes:
        data[code] = {"first": ids[0], "ids": ids, "time": now}
    data = {c: v for c, v in data.items() if now - v["time"] < KEEP_DAYS * 86400}
    FILE.write_text(json.dumps(data), encoding="utf-8")


def first_message(code):
    entry = _load().get(code)
    return entry["first"] if entry else None
