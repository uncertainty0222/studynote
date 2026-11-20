"""설정된 알림 채널(텔레그램, 카카오톡 나에게 보내기) 모두로 보낸다."""
import kakao
import telegram


def send(text):
    """보낸 텔레그램 메시지 번호 목록을 돌려준다(텔레그램이 없으면 빈 목록)."""
    sent = False
    ids = []
    if telegram.configured():
        ids = telegram.send(text)
        sent = True
    if kakao.TOKEN_FILE.exists():
        kakao.send(text.replace("**", ""))  # 카카오 텍스트는 굵게 표시를 지원하지 않는다
        sent = True
    if not sent:
        raise RuntimeError("알림 채널이 없습니다. python telegram.py setup 을 실행하세요.")
    return ids
