"""
텔레그램 봇으로 알림 보내기. 휴대폰과 PC(텔레그램 데스크톱) 모두에 알림음과 함께 온다.

최초 1회 설정:  python telegram.py setup
  1) 텔레그램에서 @BotFather 에게 /newbot 을 보내 봇을 만들고 토큰을 받는다.
  2) 만든 봇과의 대화창을 열어 아무 메시지나 한 번 보낸다(예: /start).
  3) 이 명령을 실행해 토큰을 입력하면, 방금 보낸 메시지로 내 채팅 ID를 찾아 저장한다.
테스트:  python telegram.py test
"""
import html
import json
import re
import sys
from pathlib import Path

import requests

CONF_FILE = Path(__file__).parent / "telegram.json"
MAX_TEXT = 4000  # 텔레그램 메시지 최대 4096자


def configured():
    return CONF_FILE.exists()


def _api(token, method, **params):
    # getUpdates 는 서버가 최대 timeout 초까지 기다렸다 답하므로 그만큼 더 기다린다.
    wait = 20 + int(params.get("timeout", 0))
    r = requests.post(f"https://api.telegram.org/bot{token}/{method}", data=params, timeout=wait)
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(f"텔레그램 {method} 실패: {data}")
    return data["result"]


def setup():
    token = input("봇 토큰: ").strip()
    updates = _api(token, "getUpdates")
    chats = [u["message"]["chat"] for u in updates if "message" in u]
    if not chats:
        raise SystemExit("봇에게 보낸 메시지가 없습니다. 봇 대화창에서 /start 를 보낸 뒤 다시 실행하세요.")
    chat = chats[-1]
    CONF_FILE.write_text(json.dumps({"token": token, "chat_id": chat["id"]}), encoding="utf-8")
    print(f"저장 완료: {chat.get('first_name', '')} (chat_id {chat['id']})")


def _to_html(text):
    """**굵게** 표시를 텔레그램 HTML 로 바꾸고 나머지는 이스케이프한다."""
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", html.escape(text, quote=False))


def _chunks(text):
    """줄 단위로 MAX_TEXT 이하로 나눈다(태그가 잘리지 않게)."""
    out, cur = [], ""
    for line in text.split("\n"):
        if cur and len(cur) + len(line) + 1 > MAX_TEXT:
            out.append(cur)
            cur = line
        else:
            cur = f"{cur}\n{line}" if cur else line
    if cur:
        out.append(cur)
    return out


def send(text):
    if not configured():
        raise SystemExit("텔레그램 설정이 없습니다. 먼저 python telegram.py setup 을 성공시켜 주세요.")
    conf = json.loads(CONF_FILE.read_text(encoding="utf-8"))
    for part in _chunks(text):
        _api(conf["token"], "sendMessage", chat_id=conf["chat_id"], text=_to_html(part), parse_mode="HTML")


def _conf():
    if not configured():
        raise SystemExit("텔레그램 설정이 없습니다. 먼저 python telegram.py setup 을 성공시켜 주세요.")
    return json.loads(CONF_FILE.read_text(encoding="utf-8"))


def call(method, **params):
    """설정된 봇·채팅으로 API 호출. reply_markup 등 dict 값은 JSON 으로 보낸다."""
    conf = _conf()
    params = {k: json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v
              for k, v in params.items() if v is not None}
    return _api(conf["token"], method, **params)


def chat_id():
    return _conf()["chat_id"]


def keyboard(rows):
    """[[(글자, 콜백데이터), ...], ...] → 인라인 버튼"""
    return {"inline_keyboard": [[{"text": t, "callback_data": d} for t, d in row] for row in rows]}


def send_message(text, buttons=None):
    """메시지 하나(4000자 이하)를 보내고 message_id 를 돌려준다."""
    res = call("sendMessage", chat_id=chat_id(), text=_to_html(text), parse_mode="HTML",
               reply_markup=keyboard(buttons) if buttons else None)
    return res["message_id"]


def edit_message(message_id, text, buttons=None):
    try:
        call("editMessageText", chat_id=chat_id(), message_id=message_id, text=_to_html(text),
             parse_mode="HTML", reply_markup=keyboard(buttons) if buttons else None)
    except RuntimeError as e:
        if "message is not modified" not in str(e):  # 내용이 같으면 텔레그램이 오류로 돌려준다
            raise


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "setup":
        setup()
    elif cmd == "test":
        send("하나투어 일감 알림 테스트 메시지입니다.")
        print("전송 완료. 텔레그램을 확인하세요.")
    else:
        print(__doc__)
