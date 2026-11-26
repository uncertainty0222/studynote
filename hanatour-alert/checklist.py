"""
팀별 쇼핑·식당 예약 체크(텔레그램 버튼)와 고정 현황판, 출발 D-3 독촉.

  - checklist.json 에 팀별 예약 항목과 완료 여부를 저장한다. 팀은 출발일(YYYY-MM-DD)로 구분한다.
  - monitor.py 가 새 일감·변경을 알린 뒤 update_team() 으로 팀을 등록/갱신하고 체크 메시지를 보낸다.
  - 항목: 쇼핑샵(쇼핑 횟수만큼 1번, 2번 …), 삼겹살 식당
  - 버튼을 누르면 bot.py 가 handle_callback() 으로 완료 여부를 바꾸고 현황판을 고친다.
  - 현황판은 대화방에 고정된 메시지 하나를 계속 고쳐 쓴다. 첫 줄(고정 메시지 바에 보이는 줄)에
    오늘 미팅(입국)·샌딩(귀국) 항공편을 띄운다. 팀은 마지막 샌딩 날까지 현황판에 남는다.
"""
import json
import os
import re
import time
from contextlib import contextmanager
from dataclasses import asdict
from datetime import date, datetime, timedelta
from pathlib import Path

import messages
import parse_product
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


# ---------- 오늘 일정(미팅·샌딩) ----------

def _label_date(label, ref):
    """'11/22(일)' → date. 연도는 ref(출발일) 기준, 달이 작으면 다음 해."""
    m, d = map(int, re.findall(r"\d+", label)[:2])
    return date(ref.year + (m < ref.month), m, d)


def _sending_day(booking, start, end):
    """샌딩(공항 배웅) 날: 귀국편 출발 날짜. 새벽(06시 전) 출발이면 전날 밤에 공항으로 가므로 하루 앞당긴다."""
    out = booking.get("out")
    if not out or not out.get("dep_date"):
        return end - timedelta(days=1)
    day = _label_date(out["dep_date"], start)
    return day - timedelta(days=1) if int(out["dep_time"][:2]) < 6 else day


def _plus(leg):
    return "+1" if leg.get("next_day") else ""


def _meeting(team, key):
    """오늘 미팅(입국) 줄: 도착 시각 순. 각 줄 = (정렬키, 자세한 줄, 짧은 표기, 인원)"""
    rows = []
    for b in team.get("flights", []):
        leg = b.get("in")
        if not leg:
            continue
        sort = (bool(leg.get("next_day")), leg["arr_time"])
        rows.append((sort, f"{leg['arr_time']}{_plus(leg)} 도착 {leg['flight']} ({leg['dep']} {leg['dep_time']} 출발) · {b['pax']}명",
                     f"{leg['flight']} {leg['arr_time']}{_plus(leg)}", b["pax"]))
    return sorted(rows)


def _sending(team, key, day):
    """오늘 샌딩(귀국) 줄: 출발 시각 순. 자정 넘어 출발하면 (+1)"""
    start = date.fromisoformat(key)
    rows = []
    for b in team.get("flights", []):
        leg = b.get("out")
        if not leg or _sending_day(b, start, date.fromisoformat(team["end"])) != day:
            continue
        nxt = "+1" if _label_date(leg["dep_date"], start) > day else ""
        rows.append(((nxt, leg["dep_time"]), f"{leg['dep_time']}{nxt} 출발 {leg['flight']} ({leg['dep']} → {leg['arr']}) · {b['pax']}명",
                     f"{leg['flight']} {leg['dep_time']}{nxt}", b["pax"]))
    return sorted(rows)


def _hotel_lines(team):
    """호텔: 팀 전체가 같으면 한 줄, 예약마다 다르면 가는편 항공으로 구분해 여러 줄."""
    routes = [h for h in team.get("hotels", []) if h["route"]]
    if not routes:
        return []
    if len({tuple(h["route"]) for h in routes}) == 1:
        return ["  🏨 " + " - ".join(routes[0]["route"])]
    flight = {b["code"]: (b.get("in") or {}).get("flight", "") for b in team.get("flights", [])}
    pax = {b["code"]: b["pax"] for b in team.get("flights", [])}
    land = {b["code"]: (bool((b.get("in") or {}).get("next_day")), (b.get("in") or {}).get("arr_time", "99"))
            for b in team.get("flights", [])}
    routes.sort(key=lambda h: land.get(h["code"], (True, "99")))  # 위 항공편과 같은 도착 순서
    return [f"  🏨 {flight.get(h['code']) or h['code']}({pax.get(h['code'], '?')}명): " + " - ".join(h["route"])
            for h in routes]


def needs_refresh(start, today=None):
    """출발 전 팀인데 호텔 정보가 없으면(예전 버전에서 등록) True → monitor 가 상품페이지를 다시 읽는다."""
    today = today or date.today()
    if start < today:
        return False
    state = load()
    key = _find(state, start)
    return bool(key) and "hotels" not in state["teams"][key]


def today_events(state, today):
    """[(제목 한 줄, 자세한 줄들)] — 오늘 미팅·샌딩이 있는 팀마다"""
    out = []
    for key, team in sorted(state["teams"].items()):
        if key == today.isoformat():
            rows = _meeting(team, key)
            if rows:
                out.append((f"✈️ 오늘 미팅 {_day(key)} · {team['pax']}명 | " + " · ".join(r[2] for r in rows),
                            [f"  {r[1]}" for r in rows] + _hotel_lines(team)))
        if team.get("end"):
            rows = _sending(team, key, today)
            if rows:
                out.append((f"🛫 오늘 샌딩 {_day(today.isoformat())} · {sum(r[3] for r in rows)}명 | "
                            + " · ".join(r[2] for r in rows), [f"  {r[1]}" for r in rows]))
    return out


def board_text(state, today):
    """첫 줄은 대화창 위 고정 메시지 바에 그대로 보인다. 오늘 미팅·샌딩이 있으면 그것을 첫 줄에 둔다."""
    events = today_events(state, today)
    head = " / ".join(e[0] for e in events) if events else "📋 행사 예약 현황"
    lines = [f"**{head}**", f"({datetime.now():%m/%d %H:%M} 갱신)"]
    for title, rows in events:
        lines += ["", f"**{title.split(' | ')[0]}**"] + rows
    ongoing = sorted((k, t) for k, t in state["teams"].items() if date.fromisoformat(k) < today)
    for key, team in ongoing:
        lines += ["", f"**{_day(key)} 출발 · 진행 중 · {team['pax']}명**  {team['title']}"]
        sends = sorted({_sending_day(b, date.fromisoformat(key), date.fromisoformat(team['end']))
                        for b in team.get("flights", []) if team.get("end")})
        if sends:
            lines.append("  🛫 샌딩 " + ", ".join(_day(d.isoformat()) for d in sends))
    upcoming = sorted((k, t) for k, t in state["teams"].items() if date.fromisoformat(k) >= today)
    if events:  # 첫 줄이 오늘 일정일 때만 현황 제목을 따로 단다
        lines += ["", "**📋 행사 예약 현황**"]
    if not upcoming:
        lines.append("다가오는 행사가 없습니다.")
    for key, team in upcoming:
        dday = (date.fromisoformat(key) - today).days
        lines += ["", f"**{_day(key)} 출발 · D-{dday} · {team['pax']}명**  {team['title']}"]
        lines += _item_lines(team)
    return "\n".join(lines)


def _until(key, team):
    """현황판에 남겨 둘 마지막 날: 마지막 샌딩 날(없으면 출발일)"""
    start = date.fromisoformat(key)
    if not team.get("end"):
        return start
    end = date.fromisoformat(team["end"])
    return max([start] + [_sending_day(b, start, end) for b in team.get("flights", [])])


# ---------- monitor.py 에서 부르는 것 ----------

def update_team(group, products, resend=True):
    """팀을 등록하거나 갱신하고 체크 메시지를 새로 보낸다. 완료 표시는 유지하되,
    인원이나 날짜가 바뀐 항목은 다시 확인하도록 ⬜ 로 되돌린다.
    resend=False: 저장된 정보(항공·호텔 등)만 고치고 체크 메시지는 다시 보내지 않는다."""
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
            "end": max(t.end for t in mains).isoformat(),
            "flights": _flights(mains, products),
            "hotels": [{"code": t.code, "route": parse_product.hotel_route(products[t.code])}
                       for t in mains if t.code in products],
            "items": items,
            "msg": (old or {}).get("msg"),
        }
        save(state)
    if not resend and old and old.get("msg"):
        _safe_edit(old["msg"], _check_text(key, state["teams"][key]), _buttons(key))
        return
    if old and old.get("msg"):
        _safe_edit(old["msg"], "↪️ 배정이 바뀌어 아래 새 체크 메시지로 대신합니다.")
    msg = telegram.send_message(_check_text(key, state["teams"][key]), _buttons(key))
    with _locked():
        state = load()
        state["teams"][key]["msg"] = msg
        save(state)


def _flights(mains, products):
    """예약별 가는편(in)·오는편(out). 상품페이지 일정표의 항공 구간을 쓴다."""
    out = []
    for t in mains:
        legs = products[t.code].flights if t.code in products and products[t.code].flights else []
        out.append({
            "code": t.code, "pax": t.pax,
            "in": asdict(legs[0]) if legs else None,
            "out": asdict(legs[-1]) if len(legs) > 1 else None,
        })
    return out


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
        past = [state["teams"].pop(k) for k, t in list(state["teams"].items()) if _until(k, t) < today]
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
    """오전 실행 때: 오늘 미팅·샌딩 안내, 그리고 출발 D-3 ~ D-0 인데 아직 ⬜ 인 예약 독촉."""
    today = today or date.today()
    state = load()
    # 오늘 미팅·샌딩이 있으면 알림음과 함께 먼저 알린다(고정 현황판 고치기는 알림음이 없다).
    for title, rows in today_events(state, today):
        telegram.send_message("\n".join([f"**{title.split(' | ')[0]}**"] + rows))
    for key, team in sorted(state["teams"].items()):
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
        _answer(query, "지난 행사, 바뀐 배정이거나 없어진 버튼입니다.")
        return
    icon, name = _meta(item, it)
    _answer(query, f"{name} 예약 {'완료' if it['done'] else '미완료'}로 표시했습니다.")
    pressed = query.get("message", {}).get("message_id")
    if team.get("msg"):
        _safe_edit(team["msg"], _check_text(key, team), _buttons(key))
    if pressed and pressed != team.get("msg"):
        # 독촉 메시지에서 누른 경우: 그 메시지는 처리 결과만 남긴다.
        _safe_edit(pressed, f"{icon} {_day(key)} 출발 팀 {name} 예약: {'✅ 완료' if it['done'] else '⬜ 미완료'}")
    refresh_board()


def _answer(query, text):
    """버튼을 누른 쪽에 짧은 안내를 띄운다. PC가 잠들어 있다 깨어나 늦게 처리하면 텔레그램이
    'query is too old' 로 거절하는데, 그래도 체크 표시와 현황판은 고쳐야 하므로 실패를 무시한다."""
    try:
        telegram.call("answerCallbackQuery", callback_query_id=query["id"], text=text)
    except RuntimeError:
        pass


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
