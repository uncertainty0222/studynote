"""
카카오톡 "나에게 보내기".

최초 1회 설정:  python kakao.py setup
  1) developers.kakao.com 에서 앱을 만들고 REST API 키를 확인한다.
  2) 카카오 로그인 활성화, Redirect URI 에 http://localhost:5000 등록.
  3) 동의항목에서 "카카오톡 메시지 전송(talk_message)" 을 사용으로 설정.
  4) 플랫폼 > Web 사이트 도메인에 https://has.hanatour.net 등록(메시지 링크용).
  5) 이 명령을 실행하면 브라우저가 열리고, 동의하면 토큰이 kakao_token.json 에 저장된다.
테스트:  python kakao.py test
"""
import json
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import requests

TOKEN_FILE = Path(__file__).parent / "kakao_token.json"
REDIRECT_URI = "http://localhost:5000"
LINK = "https://has.hanatour.net/main"
MAX_TEXT = 200  # 텍스트 템플릿 본문 최대 길이


def _load():
    return json.loads(TOKEN_FILE.read_text(encoding="utf-8"))


def _store(data):
    TOKEN_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def _token_request(params):
    r = requests.post("https://kauth.kakao.com/oauth/token", data=params, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"카카오 토큰 발급 실패 {r.status_code}: {r.text}")
    return r.json()


def setup():
    rest_key = input("REST API 키: ").strip()
    secret = input("Client Secret (사용 안 하면 Enter): ").strip()
    url = "https://kauth.kakao.com/oauth/authorize?" + urlencode(
        {"client_id": rest_key, "redirect_uri": REDIRECT_URI, "response_type": "code", "scope": "talk_message"}
    )
    code = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            q = parse_qs(urlparse(self.path).query)
            code.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("완료되었습니다. 이 창을 닫아도 됩니다.".encode())

        def log_message(self, *a):
            pass

    server = HTTPServer(("localhost", 5000), Handler)
    print("브라우저에서 카카오 로그인 후 동의해 주세요.")
    webbrowser.open(url)
    while "code" not in code and "error" not in code:
        server.handle_request()
    if "error" in code:
        raise SystemExit(f"동의 실패: {code}")
    params = {"grant_type": "authorization_code", "client_id": rest_key,
              "redirect_uri": REDIRECT_URI, "code": code["code"]}
    if secret:
        params["client_secret"] = secret
    tok = _token_request(params)
    tok.update(rest_key=rest_key, client_secret=secret, issued_at=time.time())
    _store(tok)
    print("저장 완료:", TOKEN_FILE)
    print("동의된 권한:", tok.get("scope", "(응답에 없음)"))
    if "talk_message" not in tok.get("scope", ""):
        print("⚠ 카카오톡 메시지 전송 동의가 빠졌습니다. 동의 화면에서 해당 항목을 체크했는지 확인하세요.")


def _access_token():
    tok = _load()
    # 만료 10분 전이면 갱신한다. 갱신 응답에 refresh_token 이 오면 그것도 교체한다.
    if time.time() > tok["issued_at"] + tok["expires_in"] - 600:
        params = {"grant_type": "refresh_token", "client_id": tok["rest_key"],
                  "refresh_token": tok["refresh_token"]}
        if tok.get("client_secret"):
            params["client_secret"] = tok["client_secret"]
        new = _token_request(params)
        tok.update(new, issued_at=time.time())
        _store(tok)
    return tok["access_token"]


def _chunks(text):
    """줄 단위로 MAX_TEXT 이하 조각으로 나눈다."""
    out, cur = [], ""
    for line in text.split("\n"):
        while len(line) > MAX_TEXT:
            if cur:
                out.append(cur)
                cur = ""
            out.append(line[:MAX_TEXT])
            line = line[MAX_TEXT:]
        if len(cur) + len(line) + 1 > MAX_TEXT:
            out.append(cur)
            cur = line
        else:
            cur = f"{cur}\n{line}" if cur else line
    if cur:
        out.append(cur)
    return out


def send(text):
    """나에게 보내기. 200자를 넘으면 여러 개로 나눠 보낸다."""
    for part in _chunks(text):
        template = {"object_type": "text", "text": part,
                    "link": {"web_url": LINK, "mobile_web_url": LINK}}
        r = requests.post(
            "https://kapi.kakao.com/v2/api/talk/memo/default/send",
            headers={"Authorization": f"Bearer {_access_token()}"},
            data={"template_object": json.dumps(template, ensure_ascii=False)},
            timeout=20,
        )
        if r.status_code != 200:
            raise RuntimeError(f"카카오톡 전송 실패 {r.status_code}: {r.text}")
        time.sleep(0.5)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "setup":
        setup()
    elif cmd == "test":
        send("하나투어 일감 알림 테스트 메시지입니다.")
        print("전송 완료. 카카오톡 '나와의 채팅'을 확인하세요.")
    else:
        print(__doc__)
