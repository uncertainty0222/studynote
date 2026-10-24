"""
HAS 로그인 정보 저장/불러오기.

처음 한 번만 입력받고, 이후에는 저장된 값을 쓴다.
  - 법인코드·아이디: 이 폴더의 has_account.txt (비밀이 아니므로 일반 파일)
  - 패스워드: Windows 자격 증명 관리자(keyring). 파일로 남기지 않는다.
다시 입력하려면: python discover.py --reset
"""
from getpass import getpass
from pathlib import Path

import keyring
from keyring.errors import PasswordDeleteError

SERVICE = "hanatour-has"
ACCOUNT_FILE = Path(__file__).parent / "has_account.txt"


def load(reset=False):
    if not reset and ACCOUNT_FILE.exists():
        corp, uid = ACCOUNT_FILE.read_text(encoding="utf-8").split()[:2]
        pw = keyring.get_password(SERVICE, f"{corp}/{uid}")
        if pw:
            return corp, uid, pw
    corp = input("법인코드: ").strip()
    uid = input("아이디: ").strip()
    pw = getpass("패스워드(입력해도 표시되지 않음): ")
    return corp, uid, pw


def save(corp, uid, pw):
    """로그인에 성공한 값만 저장한다."""
    ACCOUNT_FILE.write_text(f"{corp} {uid}\n", encoding="utf-8")
    keyring.set_password(SERVICE, f"{corp}/{uid}", pw)


def forget():
    if ACCOUNT_FILE.exists():
        corp, uid = ACCOUNT_FILE.read_text(encoding="utf-8").split()[:2]
        try:
            keyring.delete_password(SERVICE, f"{corp}/{uid}")
        except PasswordDeleteError:
            pass
        ACCOUNT_FILE.unlink()
