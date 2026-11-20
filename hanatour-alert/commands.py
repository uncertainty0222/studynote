"""
텔레그램 명령(휴대폰에서 PC의 하스 알리미 관리). bot.py 가 받아서 handle() 로 넘긴다.

    /list    (/일감)      출발 전(대기 중) 일감 목록. [N번 상세] 버튼을 누르면 예전에 받은
                          그 팀 알림으로 이동하는 답장을 보낸다(기록이 없으면 HAS 에서 새로 읽음)
    /status  (/상태)      마지막 일감 확인 결과, 다음 실행 예정, 봇 상태, 설치된 버전
    /run     (/실행)      지금 바로 일감 확인(monitor.py) 실행
    /update  (/업데이트)  GitHub 에서 최신 코드를 받아 적용하고 봇을 다시 켠다

등록된 본인 채팅에서 온 명령만 처리한다(bot.py 에서 걸러 낸다).
"""
import hashlib
import json
import os
import py_compile
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import date, datetime
from pathlib import Path

import requests

import messages
import sent_log
import telegram

HERE = Path(__file__).parent
REPO = "uncertainty0222/studynote"
FOLDER = "hanatour-alert"
BRANCH = "master"
VERSION_FILE = HERE / "version.json"
STARTED = time.strftime("%m/%d %H:%M")

# 텔레그램 입력창의 "/" 메뉴에 보이는 명령(영문만 가능)
MENU = [
    {"command": "list", "description": "대기 중인 일감 목록"},
    {"command": "status", "description": "상태 확인"},
    {"command": "run", "description": "지금 일감 확인"},
    {"command": "update", "description": "최신 코드로 업데이트"},
]

_running = threading.Lock()  # /run 과 /update 가 겹치지 않게


def register_menu():
    try:
        telegram.call("setMyCommands", commands=MENU)
    except Exception:
        pass


def handle(text, restart):
    """restart: 봇을 다시 켜는 함수(bot.py 가 넘겨준다)"""
    raw = (text or "").strip().split()[0].split("@")[0]
    cmd = raw.lower()
    if cmd in ("/list", "/일감"):
        telegram.send_message(*list_message())
    elif re.fullmatch(r"/A[A-Z]{2}\w{9,}", raw):  # 행사코드를 직접 보낸 경우
        code = raw[1:]
        _in_background(lambda: show_detail(code))
    elif cmd in ("/status", "/상태"):
        telegram.send_message(status_text())
    elif cmd in ("/run", "/실행"):
        _in_background(run_monitor)
    elif cmd in ("/update", "/업데이트"):
        _in_background(lambda: update(restart))
    elif cmd in ("/start", "/help", "/도움말"):
        telegram.send_message("**하스 알리미 명령**\n/list 대기 중인 일감 목록\n/status 상태 확인\n"
                              "/run 지금 일감 확인\n/update 최신 코드로 업데이트")


def _in_background(job):
    """버튼 처리가 멈추지 않도록 오래 걸리는 일은 따로 돌린다."""
    if not _running.acquire(blocking=False):
        telegram.send_message("이미 다른 작업(/run 또는 /update)을 하는 중입니다. 끝난 뒤 다시 보내 주세요.")
        return

    def wrapper():
        try:
            job()
        except Exception as e:
            telegram.send_message(f"⚠️ 명령 처리 중 오류: {type(e).__name__}: {str(e)[:200]}")
        finally:
            _running.release()

    threading.Thread(target=wrapper, daemon=True).start()


# ---------- /list ----------

WEEKDAY = "월화수목금토일"


def _day(d):
    return f"{d.month}/{d.day}({WEEKDAY[d.weekday()]})"


def _teams(state):
    """state.json(행사코드별 출발·종료·인원)을 출발일 하루 이내끼리 팀으로 묶는다(알림과 같은 기준).
    일일투어 같은 부가 행사(출발일=종료일)는 인원·코드 목록에서 뺀다."""
    rows = sorted((date.fromisoformat(i["start"]), code, i) for code, i in state.items() if i)
    teams = []
    for start, code, info in rows:
        if teams and (start - teams[-1]["start"]).days <= 1:
            teams[-1]["rows"].append((code, info))
        else:
            teams.append({"start": start, "rows": [(code, info)]})
    for t in teams:
        mains = [(c, i) for c, i in t["rows"] if i.get("end", i["start"]) != i["start"]] or t["rows"]
        t["codes"] = [c for c, _ in mains]
        t["pax"] = sum(i["pax"] for _, i in mains)
        t["end"] = max(date.fromisoformat(i.get("end", i["start"])) for _, i in mains)
        t["title"] = mains[0][1].get("title", "")
    return teams


def _shopping(start):
    """쇼핑 횟수 표시. 예약 체크(checklist.json)에 기록된 쇼핑샵 수를 쓴다."""
    path = HERE / "checklist.json"
    if not path.exists():
        return ""
    for key, team in json.loads(path.read_text(encoding="utf-8")).get("teams", {}).items():
        if abs((date.fromisoformat(key) - start).days) <= 1:
            shops = [k for k in team.get("items", {}) if k.startswith("shop")]
            if shops == ["shop"]:  # 예전 형식(횟수 기록 없음)
                return " · 쇼핑 있음"
            return f" · 쇼핑 {len(shops)}회" if shops else " · 노쇼핑"
    return ""


def list_message():
    """(글, 버튼). 출발 전(대기 중) 팀만: 출발일·인원·쇼핑·투어 제목, 아래 [N번 상세] 버튼."""
    path = HERE / "state.json"
    if not path.exists():
        return "아직 일감 기록이 없습니다. 정기 확인이 한 번 끝난 뒤 다시 보내 주세요.", None
    today = date.today()
    waiting = [t for t in _teams(json.loads(path.read_text(encoding="utf-8"))) if t["start"] > today]
    updated = datetime.fromtimestamp(path.stat().st_mtime)
    lines = [f"**대기 중인 일감 {len(waiting)}건** ({updated:%m/%d %H:%M} 확인 기준)"]
    if not waiting:
        lines += ["", "출발 전인 일감이 없습니다."]
        return "\n".join(lines), None
    buttons = []
    for n, t in enumerate(waiting, 1):
        lines += ["", f"{n}. {_day(t['start'])} 출발 · {t['pax']}명{_shopping(t['start'])}",
                  f"   {messages.short_title(t['title'])}"]
        buttons.append((f"📄 {n}번 상세", f"d|{t['codes'][0]}"))
    lines += ["", "아래 버튼을 누르면 그 팀 상세 알림(인원·항공·명단·일정)으로 안내합니다."]
    return "\n".join(lines), [buttons[i:i + 3] for i in range(0, len(buttons), 3)]


def handle_callback(query):
    """[N번 상세] 버튼(d|코드)과 [HAS 에서 새로 불러오기](r|코드). 처리했으면 True
    (그 외 버튼은 checklist 가 처리)."""
    data = query.get("data") or ""
    if not data.startswith(("d|", "r|")):
        return False
    code = data[2:]
    try:
        telegram.call("answerCallbackQuery", callback_query_id=query["id"])
    except Exception:
        pass
    if data.startswith("d|") and jump_to_detail(code):
        return True
    _in_background(lambda: show_detail(code))
    return True


def jump_to_detail(code):
    """예전에 보낸 상세 알림에 답장을 단다. 텔레그램에서 인용 부분을 누르면 그 알림으로 이동한다.
    기록이 없거나 원래 알림이 지워졌으면 False(→ HAS 에서 새로 불러온다)."""
    first = sent_log.first_message(code)
    if not first:
        return False
    start = _start_of(code)
    when = f"{_day(start)} 출발 팀 " if start else ""
    try:
        telegram.send_message(f"⬆️ {when}상세 정보는 위 인용을 누르면 이동합니다.",
                              [[("🔄 HAS 에서 최신으로 다시 불러오기", f"r|{code}")]], reply_to=first)
        return True
    except RuntimeError:
        return False


def _start_of(code):
    path = HERE / "state.json"
    info = json.loads(path.read_text(encoding="utf-8")).get(code) if path.exists() else None
    return date.fromisoformat(info["start"]) if info else None


def show_detail(code):
    telegram.send_message(f"🔄 {code} 상세 정보를 HAS 에서 불러오는 중입니다(1~2분).")
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    proc = subprocess.run([_python(), "monitor.py", "--show", code], cwd=HERE, capture_output=True,
                          text=True, encoding="utf-8", errors="replace", timeout=900, env=env,
                          creationflags=0x08000000 if os.name == "nt" else 0)
    if proc.returncode != 0:
        telegram.send_message(f"⚠️ 상세 정보를 불러오지 못했습니다 (종료 코드 {proc.returncode}). /status 로 기록을 확인해 주세요.")


# ---------- /status ----------

def _tail(path, n):
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8", errors="replace").splitlines()[-n:]


def _task_info(name):
    """Windows 작업 스케줄러 정보(마지막 실행, 결과, 다음 실행). Windows 가 아니면 빈 값."""
    if os.name != "nt":
        return None
    ps = (f"$i = Get-ScheduledTaskInfo -TaskName '{name}'; "
          "'{0:MM/dd HH:mm}|{1}|{2:MM/dd HH:mm}' -f $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime")
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True,
                             text=True, timeout=30, creationflags=0x08000000)  # 콘솔 창 띄우지 않음
        last, result, nxt = out.stdout.strip().split("|")
        return last, result, nxt
    except Exception:
        return None


def status_text():
    lines = ["**하스 알리미 상태**", f"🤖 봇: 동작 중 (켜진 시각 {STARTED})"]
    info = _task_info("HanatourAlert")
    if info:
        last, result, nxt = info
        ok = "정상" if result == "0" else f"오류 코드 {result}"
        lines.append(f"⏱ 정기 확인: 마지막 {last} ({ok}) · 다음 {nxt}")
    log = _tail(HERE / "monitor.log", 3)
    if log:
        lines += ["", "**최근 기록**"] + [f"  {x}" for x in log]
    if VERSION_FILE.exists():
        v = json.loads(VERSION_FILE.read_text(encoding="utf-8"))
        lines += ["", f"📦 버전: {v.get('commit', '?')[:7]} ({v.get('time', '?')} 업데이트)"]
    else:
        lines += ["", "📦 버전: /update 를 한 번 하면 표시됩니다"]
    return "\n".join(lines)


# ---------- /run ----------

def _python():
    """창 없는 pythonw 로 돌고 있으면, 출력을 받을 수 있게 같은 폴더의 python 을 쓴다."""
    exe = Path(sys.executable)
    console = exe.with_name("python.exe")
    return str(console if exe.name.lower() == "pythonw.exe" and console.exists() else exe)


def run_monitor():
    telegram.send_message("🔄 일감 확인을 시작합니다. 1~3분 걸립니다.")
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    proc = subprocess.run([_python(), "monitor.py"], cwd=HERE, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=1200, env=env,
                          creationflags=0x08000000 if os.name == "nt" else 0)
    last = (_tail(HERE / "monitor.log", 1) or ["(기록 없음)"])[0]
    if proc.returncode == 0:
        telegram.send_message(f"✅ 일감 확인 완료\n{last}")
    else:
        # 실패하면 monitor.py 가 이미 실패 알림을 보낸다. 여기서는 짧게만.
        telegram.send_message(f"⚠️ 일감 확인 실패 (종료 코드 {proc.returncode})\n{last}")


# ---------- /update ----------

def _files():
    """GitHub 폴더의 코드 파일 목록(.py, .bat). 데이터 파일(json 등)은 건드리지 않는다."""
    r = requests.get(f"https://api.github.com/repos/{REPO}/contents/{FOLDER}",
                     params={"ref": BRANCH}, timeout=30)
    r.raise_for_status()
    return [f for f in r.json() if f["type"] == "file" and f["name"].endswith((".py", ".bat"))]


def _latest_commit():
    try:
        r = requests.get(f"https://api.github.com/repos/{REPO}/commits/{BRANCH}",
                         params={"path": FOLDER}, timeout=30)
        return r.json()["sha"]
    except Exception:
        return "?"


def update(restart):
    telegram.send_message("⬇️ 최신 코드를 받는 중입니다.")
    files = _files()
    changed = []
    with tempfile.TemporaryDirectory() as tmp:
        # 전부 받아서 문법 검사를 통과한 뒤에만 바꾼다. 하나라도 이상하면 아무것도 바꾸지 않는다.
        for f in files:
            data = requests.get(f["download_url"], timeout=30).content
            path = Path(tmp) / f["name"]
            path.write_bytes(data)
            if f["name"].endswith(".py"):
                py_compile.compile(str(path), doraise=True)
            local = HERE / f["name"]
            if not local.exists() or hashlib.sha256(local.read_bytes()).digest() != hashlib.sha256(data).digest():
                changed.append(f["name"])
        for name in changed:
            shutil.copyfile(Path(tmp) / name, HERE / name)
    VERSION_FILE.write_text(json.dumps({"commit": _latest_commit(), "time": time.strftime("%m/%d %H:%M")}),
                            encoding="utf-8")
    if not changed:
        telegram.send_message("✅ 이미 최신입니다. 바뀐 파일이 없습니다.")
        return
    telegram.send_message("✅ 업데이트 완료\n바뀐 파일: " + ", ".join(changed) + "\n봇을 다시 켭니다(몇 초).")
    restart()
