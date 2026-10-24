"""
텔레그램 봇으로 알림 보내기. 휴대폰과 PC(텔레그램 데스크톱) 모두에 알림음과 함께 온다.

최초 1회 설정:  python telegram.py setup
  1) 텔레그램에서 @BotFather 에게 /newbot 을 보내 봇을 만들고 토큰을 받는다.
  2) 만든 봇과의 대화창을 열어 아무 메시지나 한 번 보낸다(예: /start).
  3) 이 명령을 실행해 토큰을 입력하면, 방금 보낸 메시지로 내 채팅 ID를 찾아 저장한다.
테스트:  python telegram.py test
"""
import json
import sys
from pathlib import Path

import requests

CONF_FILE = Path(__file__).parent / "telegram.json"
MAX_TEXT = 4000  # 텔레그램 메시지 최대 4096자


def configured():
    return CONF_FILE.exists()


def _api(token, method, **params):
    r = requests.post(f"https://api.telegram.org/bot{token}/{method}", data=params, timeout=20)
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


def send(text):
    if not configured():
        raise SystemExit("텔레그램 설정이 없습니다. 먼저 python telegram.py setup 을 성공시켜 주세요.")
    conf = json.loads(CONF_FILE.read_text(encoding="utf-8"))
    for i in range(0, len(text), MAX_TEXT):
        _api(conf["token"], "sendMessage", chat_id=conf["chat_id"], text=text[i:i + MAX_TEXT])


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "setup":
        setup()
    elif cmd == "test":
        send("하나투어 일감 알림 테스트 메시지입니다.")
        print("전송 완료. 텔레그램을 확인하세요.")
    else:
        print(__doc__)
