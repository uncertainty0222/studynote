"""
개인정보가 담긴 화면 HTML을 '구조만 남긴 사본'으로 바꾼다. 코드 작성용으로 공유할 때 쓴다.

  - 태그, class, id 등 화면 구조는 그대로 둔다.
  - 글자는 종류만 남긴다: 한글 → 가, 숫자 → 0, 영문 → A (길이·구두점은 유지)
    예) 홍길동 → 가가가, 1958.03.12 → 0000.00.00, HONG/GILDONG → AAAA/AAAAAAA
  - 항목 이름(성별, 생년월일 등)과 남/여 같은 짧은 표시는 알아볼 수 있게 남긴다.
  - 스크립트, 입력값(value), 링크 주소의 숫자도 같은 방식으로 가린다.

사용:
    python skeleton.py dumps\\auto_customer_XXXX.html
    → dumps\\auto_customer_XXXX.skeleton.html 이 생긴다. 이 파일을 공유한다.
"""
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup, Comment

KEEP = {
    "이름", "성명", "한글명", "영문명", "영문", "성별", "남", "여", "남자", "여자", "M", "F",
    "생년월일", "생일", "나이", "연령", "성인", "아동", "유아", "소아", "구분", "번호", "No", "NO",
    "여권", "여권번호", "여권만료일", "국적", "연락처", "휴대폰", "전화", "이메일", "객실", "룸",
    "고객요청사항", "요청사항", "VIP", "VIP고객", "고객정보", "행사일정", "대표자", "비고", "메모",
    "인원", "명", "총", "TWIN", "SGL", "TRPL", "QUAD", "DBL",
}


def mask(text):
    if text.strip() in KEEP:
        return text
    text = re.sub(r"[가-힣]", "가", text)
    text = re.sub(r"[0-9]", "0", text)
    return re.sub(r"[A-Za-z]", "A", text)


def main(path):
    src = Path(path)
    soup = BeautifulSoup(src.read_text(encoding="utf-8"), "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    for c in soup.find_all(string=lambda s: isinstance(s, Comment)):
        c.extract()
    for node in soup.find_all(string=True):
        node.replace_with(mask(str(node)))
    for el in soup.find_all(True):
        for attr in ("value", "title", "alt", "placeholder", "data-value"):
            if el.has_attr(attr):
                el[attr] = mask(el[attr])
        for attr in ("href", "onclick", "src"):
            if el.has_attr(attr):
                el[attr] = re.sub(r"[0-9]", "0", el[attr])
    out = src.with_name(src.stem + ".skeleton.html")
    out.write_text(str(soup), encoding="utf-8")
    print("저장:", out)


if __name__ == "__main__":
    for p in sys.argv[1:]:
        main(p)
