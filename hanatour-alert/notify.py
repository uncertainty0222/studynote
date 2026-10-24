"""설정된 알림 채널(텔레그램, 카카오톡 나에게 보내기) 모두로 보낸다."""
import kakao
import telegram


def send(text):
    sent = False
    if telegram.configured():
        telegram.send(text)
        sent = True
    if kakao.TOKEN_FILE.exists():
        kakao.send(text)
        sent = True
    if not sent:
        raise RuntimeError("알림 채널이 없습니다. python telegram.py setup 을 실행하세요.")
