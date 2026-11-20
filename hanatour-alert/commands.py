"""
텔레그램 명령(휴대폰에서 PC의 하스 알리미 관리). bot.py 가 받아서 handle() 로 넘긴다.

    /status  (/상태)      마지막 일감 확인 결과, 다음 실행 예정, 봇 상태, 설치된 버전
    /run     (/실행)      지금 바로 일감 확인(monitor.py) 실행
    /update  (/업데이트)  GitHub 에서 최신 코드를 받아 적용하고 봇을 다시 켠다

등록된 본인 채팅에서 온 명령만 처리한다(bot.py 에서 걸러 낸다).
"""
import hashlib
import json
import os
import py_compile
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import requests

import telegram

HERE = Path(__file__).parent
REPO = "uncertainty0222/studynote"
FOLDER = "hanatour-alert"
BRANCH = "master"
VERSION_FILE = HERE / "version.json"
STARTED = time.strftime("%m/%d %H:%M")

# 텔레그램 입력창의 "/" 메뉴에 보이는 명령(영문만 가능)
MENU = [
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
    cmd = (text or "").strip().split()[0].split("@")[0].lower()
    if cmd in ("/status", "/상태"):
        telegram.send_message(status_text())
    elif cmd in ("/run", "/실행"):
        _in_background(run_monitor)
    elif cmd in ("/update", "/업데이트"):
        _in_background(lambda: update(restart))
    elif cmd in ("/start", "/help", "/도움말"):
        telegram.send_message("**하스 알리미 명령**\n/status 상태 확인\n/run 지금 일감 확인\n/update 최신 코드로 업데이트")


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
