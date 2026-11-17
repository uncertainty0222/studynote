"""
팀별 쇼핑·식당 예약 체크(텔레그램 버튼)와 고정 현황판, 출발 D-3 독촉.

  - checklist.json 에 팀별 예약 항목과 완료 여부를 저장한다. 팀은 출발일(YYYY-MM-DD)로 구분한다.
  - monitor.py 가 새 일감·변경을 알린 뒤 update_team() 으로 팀을 등록/갱신하고 체크 메시지를 보낸다.
  - 항목: 쇼핑샵(쇼핑 횟수만큼 1번, 2번 …), 삼겹살 식당
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
# 예전 버전에서 만든 항목(이름이 저장돼 있지 않음)을 보여 줄 때 쓰는 이름
LEGACY = {"shop": ("🛍", "쇼핑"), "food": ("🍖", "삼겹살")}
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

def _meta(key, it):
    """(아이콘, 이름). 쇼핑샵은 shop1, shop2 … 처럼 횟수만큼 따로 체크한다."""
    if it.get("name"):
        return it["icon"], it["name"]
    return LEGACY.get(key, ("•", key))


def _item_line(key, it):
    icon, name = _meta(key, it)
    mark = "✅" if it["done"] else "⬜"
    note = " (인원 변경 → 재확인)" if it.get("recheck") else ""
    return f"  {icon} {name} {it['label']}  {mark}{note}"


def _item_lines(team):
    items = team["items"]
    lines = []
    if not any(k.startswith("shop") for k in items):
        lines.append("  🛍 쇼핑 없음")
    lines += [_item_line(k, it) for k, it in items.items()]
    if "food" not in items:
        lines.append("  🍖 삼겹살 없음")
    return lines


def _buttons(key):
    """항목마다 완료 토글 버튼 하나, 한 줄에 두 개씩"""
    team = load()["teams"].get(key)
    if not team or not team["items"]:
        return None
    btns = [(f"{'✅' if it['done'] else '⬜'} {_meta(k, it)[1]} 예약", f"t|{key}|{k}")
            for k, it in team["items"].items()]
    return [btns[i:i + 2] for i in range(0, len(btns), 2)]


def _check_text(key, team):
    head = f"**✅ 예약 체크 · {_day(key)} 출발 {team['pax']}명**\n{team['title']}"
    return "\n".join([head] + _item_lines(team))


def board_text(state, today):
    lines = [f"**📋 행사 예약 현황** ({datetime.now():%m/%d %H:%M} 갱신)"]
    teams = sorted((k, t) for k, t in state["teams"].items() if date.fromisoformat(k) >= today)
    if not teams:
        lines += ["", "다가오는 행사가 없습니다."]
    for key, team in teams:
        dday = (date.fromisoformat(key) - today).days
        lines += ["", f"**{_day(key)} 출발 · D-{dday} · {team['pax']}명**  {team['title']}"]
        lines += _item_lines(team)
    return "\n".join(lines)


# ---------- monitor.py 에서 부르는 것 ----------

def update_team(group, products):
    """팀을 등록하거나 갱신하고 체크 메시지를 새로 보낸다. 완료 표시는 유지하되,
    인원이나 날짜가 바뀐 항목은 다시 확인하도록 ⬜ 로 되돌린다."""
    start = min(t.start for t in group.tours)
    if start < date.today():
        return  # 이미 출발한 팀(진행 중·끝난 행사)은 예약 체크 대상이 아니다
    mains = [t for t in group.tours if t.end > t.start] or group.tours
    shop = messages.shop_plan(group, products)
    foods = messages.restaurant_plans(group, products)
    items = {}
    for n, day in enumerate(messages.shop_visits(group, products), 1):
        items[f"shop{n}"] = {"icon": "🛍", "name": f"{n}번 쇼핑샵", "label": f"{day} {shop[1]}", "done": False}
    if foods:
        items["food"] = {"icon": "🍖", "name": "삼겹살",
                         "label": ", ".join(f"{d} {p}명" for d, p in foods), "done": False}
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
        past = [state["teams"].pop(k) for k in list(state["teams"]) if date.fromisoformat(k) < today]
        save(state)
    for team in past:
        _remove_message(team.get("msg"))
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
        lines += [_item_line(k, team["items"][k]) for k in todo]
        buttons = [[(f"⬜ {_meta(k, team['items'][k])[1]} 예약 → 완료로 표시", f"t|{key}|{k}")] for k in todo]
        telegram.send_message("\n".join(lines), buttons)


# ---------- bot.py 에서 부르는 것 ----------

def handle_callback(query):
    """버튼 누름 처리. data = t|팀|항목 → 완료 여부를 바꾼다."""
    action, key, item = ((query.get("data") or "") + "||").split("|")[:3]
    with _locked():
        state = load()
        team = state["teams"].get(key)
        it = team["items"].get(item) if team and action == "t" else None
        if it:
            it["done"] = not it["done"]
            it.pop("recheck", None)
            save(state)
    if not it:
        telegram.call("answerCallbackQuery", callback_query_id=query["id"],
                      text="지난 행사, 바뀐 배정이거나 없어진 버튼입니다.")
        return
    icon, name = _meta(item, it)
    telegram.call("answerCallbackQuery", callback_query_id=query["id"],
                  text=f"{name} 예약 {'완료' if it['done'] else '미완료'}로 표시했습니다.")
    pressed = query.get("message", {}).get("message_id")
    if team.get("msg"):
        _safe_edit(team["msg"], _check_text(key, team), _buttons(key))
    if pressed and pressed != team.get("msg"):
        # 독촉 메시지에서 누른 경우: 그 메시지는 처리 결과만 남긴다.
        _safe_edit(pressed, f"{icon} {_day(key)} 출발 팀 {name} 예약: {'✅ 완료' if it['done'] else '⬜ 미완료'}")
    refresh_board()


def _remove_message(message_id):
    """지난 팀의 체크 메시지를 지운다. 텔레그램은 봇이 보낸 지 48시간이 지난 메시지는
    지우지 못하게 하므로, 그때는 버튼을 없애고 '지난 행사'로 바꿔 둔다."""
    if not message_id:
        return
    try:
        telegram.call("deleteMessage", chat_id=telegram.chat_id(), message_id=message_id)
    except RuntimeError:
        _safe_edit(message_id, "🕘 지난 행사입니다.")


def _safe_edit(message_id, text, buttons=None):
    try:
        telegram.edit_message(message_id, text, buttons)
    except RuntimeError:
        pass  # 너무 오래된 메시지 등 고칠 수 없는 경우
