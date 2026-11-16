"""
팀별 쇼핑·식당 예약 체크(텔레그램 버튼)와 고정 현황판, 출발 D-3 독촉.

  - checklist.json 에 팀별 예약 항목과 완료 여부를 저장한다. 팀은 출발일(YYYY-MM-DD)로 구분한다.
  - monitor.py 가 새 일감·변경을 알린 뒤 update_team() 으로 팀을 등록/갱신하고 체크 메시지를 보낸다.
  - 버튼을 누르면 bot.py 가 handle_callback() 으로 완료 여부를 바꾸고 현황판을 고친다.
  - 현황판은 대화방에 고정된 메시지 하나를 계속 고쳐 쓴다.
"""
import json
import os
import time
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path

import messages
import telegram

HERE = Path(__file__).parent
STATE_FILE = HERE / "checklist.json"
LOCK_FILE = HERE / "checklist.lock"
REMIND_DAYS = 3  # 출발 며칠 전부터 미완료 독촉
ITEMS = {"shop": ("🛍", "쇼핑"), "food": ("🍖", "삼겹살")}
WEEKDAY = "월화수목금토일"


@contextmanager
def _locked():
    """monitor.py 와 bot.py 가 동시에 checklist.json 을 고치지 않도록 잠근다."""
    for _ in range(100):
        try:
            fd = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL)
            break
        except FileExistsError:
            # 비정상 종료로 남은 잠금은 1분 뒤 무시한다.
            if time.time() - LOCK_FILE.stat().st_mtime > 60:
                LOCK_FILE.unlink(missing_ok=True)
            time.sleep(0.1)
    else:
        raise RuntimeError("checklist.json 잠금을 얻지 못했습니다")
    try:
        yield
    finally:
        os.close(fd)
        LOCK_FILE.unlink(missing_ok=True)


def load():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"board": None, "teams": {}}


def save(state):
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(STATE_FILE)


def _day(iso):
    d = date.fromisoformat(iso)
    return f"{d.month}/{d.day}({WEEKDAY[d.weekday()]})"


def _find(state, start):
    """출발일이 하루 이내인 기존 팀(배정 변경으로 출발일이 바뀐 경우 포함)"""
    for key in state["teams"]:
        if abs((date.fromisoformat(key) - start).days) <= 1:
            return key
    return None


# ---------- 메시지 모양 ----------

def _item_line(team, key):
    it = team["items"].get(key)
    icon, name = ITEMS[key]
    if not it:
        return f"  {icon} {name} 없음"
    mark = "✅" if it["done"] else "⬜"
    note = " (인원 변경 → 재확인)" if it.get("recheck") else ""
    return f"  {icon} {name} {it['label']}  {mark}{note}"


def _buttons(key):
    team = load()["teams"].get(key)
    if not team:
        return None
    row1, row2 = [], []
    for item, (icon, name) in ITEMS.items():
        it = team["items"].get(item)
        if not it:
            continue
        row1.append((f"{'✅' if it['done'] else '⬜'} {name} 예약", f"t|{key}|{item}"))
        row2.append((f"📋 {name} 문자", f"c|{key}|{item}"))
    return [row1, row2] if row1 else None


def _check_text(key, team):
    head = f"**✅ 예약 체크 · {_day(key)} 출발 {team['pax']}명**\n{team['title']}"
    return "\n".join([head] + [_item_line(team, k) for k in ITEMS])


def board_text(state, today):
    lines = [f"**📋 행사 예약 현황** ({datetime.now():%m/%d %H:%M} 갱신)"]
    teams = sorted((k, t) for k, t in state["teams"].items() if date.fromisoformat(k) >= today)
    if not teams:
        lines += ["", "다가오는 행사가 없습니다."]
    for key, team in teams:
        dday = (date.fromisoformat(key) - today).days
        lines += ["", f"**{_day(key)} 출발 · D-{dday} · {team['pax']}명**  {team['title']}"]
        lines += [_item_line(team, k) for k in ITEMS]
    return "\n".join(lines)


# ---------- monitor.py 에서 부르는 것 ----------

def update_team(group, products):
    """팀을 등록하거나 갱신하고 체크 메시지를 새로 보낸다. 완료 표시는 유지하되,
    인원이나 날짜가 바뀐 항목은 다시 확인하도록 ⬜ 로 되돌린다."""
    start = min(t.start for t in group.tours)
    mains = [t for t in group.tours if t.end > t.start] or group.tours
    shop = messages.shop_plan(group, products)
    foods = messages.restaurant_plans(group, products)
    items = {}
    if shop:
        items["shop"] = {"label": f"{shop[0]} {shop[1]}", "text": messages.shop_text(*shop), "done": False}
    if foods:
        items["food"] = {
            "label": ", ".join(f"{d} {p}명" for d, p in foods),
            "text": "\n\n".join(messages.restaurant_text(d, p) for d, p in foods),
            "done": False,
        }
    with _locked():
        state = load()
        old_key = _find(state, start)
        old = state["teams"].pop(old_key, None) if old_key else None
        for k, it in items.items():
            before = (old or {}).get("items", {}).get(k)
            if before and before["done"]:
                if before["label"] == it["label"]:
                    it["done"] = True
                else:
                    it["recheck"] = True
        key = start.isoformat()
        state["teams"][key] = {
            "pax": sum(t.pax for t in mains),
            "title": messages.short_title(mains[0].title),
            "items": items,
            "msg": (old or {}).get("msg"),
        }
        save(state)
    if old and old.get("msg"):
        _safe_edit(old["msg"], "↪️ 배정이 바뀌어 아래 새 체크 메시지로 대신합니다.")
    msg = telegram.send_message(_check_text(key, state["teams"][key]), _buttons(key))
    with _locked():
        state = load()
        state["teams"][key]["msg"] = msg
        save(state)


def cancel_team(start):
    with _locked():
        state = load()
        key = _find(state, start)
        team = state["teams"].pop(key, None) if key else None
        save(state)
    if team and team.get("msg"):
        _safe_edit(team["msg"], f"❌ {_day(key)} 출발 팀은 배정에서 빠졌습니다.")


def refresh_board(today=None):
    """현황판을 고친다. 고정 메시지가 지워졌으면 새로 보내고 고정한다. 지난 팀은 정리한다."""
    today = today or date.today()
    with _locked():
        state = load()
        for key in [k for k in state["teams"] if date.fromisoformat(k) < today]:
            state["teams"].pop(key)
        save(state)
    text = board_text(state, today)
    if state.get("board"):
        try:
            telegram.edit_message(state["board"], text)
            return
        except RuntimeError:
            pass  # 사용자가 지웠으면 새로 만든다
    msg = telegram.send_message(text)
    try:
        telegram.call("pinChatMessage", chat_id=telegram.chat_id(), message_id=msg,
                      disable_notification=True)
    except RuntimeError:
        pass
    with _locked():
        state = load()
        state["board"] = msg
        save(state)


def remind(today=None):
    """출발 D-3 ~ D-0 인데 아직 ⬜ 인 예약을 알림음과 함께 알린다."""
    today = today or date.today()
    for key, team in sorted(load()["teams"].items()):
        dday = (date.fromisoformat(key) - today).days
        todo = [k for k, it in team["items"].items() if not it["done"]]
        if not (0 <= dday <= REMIND_DAYS) or not todo:
            continue
        lines = [f"**⏰ 예약 확인 필요 (D-{dday})**", f"{_day(key)} 출발 {team['pax']}명 · {team['title']}"]
        lines += [_item_line(team, k) for k in todo]
        buttons = [[(f"⬜ {ITEMS[k][1]} 예약 → 완료로 표시", f"t|{key}|{k}")] for k in todo]
        telegram.send_message("\n".join(lines), buttons)


# ---------- bot.py 에서 부르는 것 ----------

def handle_callback(query):
    """버튼 누름 처리. data = t|팀|항목(완료 토글) 또는 c|팀|항목(예약 문자 다시 보내기)"""
    action, key, item = (query.get("data") or "||").split("|")
    with _locked():
        state = load()
        team = state["teams"].get(key)
        it = team["items"].get(item) if team else None
        if it and action == "t":
            it["done"] = not it["done"]
            it.pop("recheck", None)
            save(state)
    if not it:
        telegram.call("answerCallbackQuery", callback_query_id=query["id"], text="지난 행사이거나 바뀐 배정입니다.")
        return
    if action == "c":
        telegram.call("answerCallbackQuery", callback_query_id=query["id"])
        telegram.send_message(it["text"])
        return
    name = ITEMS[item][1]
    telegram.call("answerCallbackQuery", callback_query_id=query["id"],
                  text=f"{name} 예약 {'완료' if it['done'] else '미완료'}로 표시했습니다.")
    pressed = query.get("message", {}).get("message_id")
    if team.get("msg"):
        _safe_edit(team["msg"], _check_text(key, team), _buttons(key))
    if pressed and pressed != team.get("msg"):
        # 독촉 메시지에서 누른 경우: 그 메시지는 처리 결과만 남긴다.
        _safe_edit(pressed, f"{ITEMS[item][0]} {_day(key)} 출발 팀 {name} 예약: {'✅ 완료' if it['done'] else '⬜ 미완료'}")
    refresh_board()


def _safe_edit(message_id, text, buttons=None):
    try:
        telegram.edit_message(message_id, text, buttons)
    except RuntimeError:
        pass  # 너무 오래된 메시지 등 고칠 수 없는 경우
