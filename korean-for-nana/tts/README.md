# 50문장 음성 만들기 (VoxCPM2, Windows)

VoxCPM 저장소(github.com/OpenBMB/VoxCPM)는 **따로 내려받을 필요가 없다.** `setup.bat`이 VoxCPM 프로그램을 설치하고, 모델 파일은 처음 실행할 때 자동으로 내려받는다.

## 필요한 것

- NVIDIA 그래픽카드 (그래픽 메모리 8GB 이상 권장), 최신 NVIDIA 드라이버
- Python 3.12: https://www.python.org/downloads/ 에서 3.12.x 설치. 설치 화면에서 "py launcher" 체크 유지
- 디스크 여유 공간: 수십 GB 권장 (PyTorch + 모델 파일)

## 1. 이 폴더 내려받기

1. GitHub에서 `uncertainty0222/studynote` 저장소를 연다.
2. 왼쪽 위 브랜치 선택 버튼(`main`이라고 적힌 버튼)을 눌러 `claude/youthful-meitner-e6exel`을 고른다. (main에 합쳐진 뒤라면 main 그대로)
3. 초록색 **Code** 버튼 → **Download ZIP**.
4. ZIP 압축을 푼다. `korean-for-nana\tts` 폴더로 들어간다.

## 2. 설치 (한 번만)

`setup.bat` 더블클릭. 끝에 `CUDA GPU: True`가 나오면 성공. `False`면 그래픽 드라이버/카드 문제.

## 3. 시험 (1번 문장만)

`test.bat` 더블클릭. 처음엔 모델을 내려받느라 오래 걸린다. 끝나면 `audio` 폴더가 열리고 `01.wav`가 생긴다. 들어보고 괜찮으면 다음 단계.

## 4. 50문장 전부

`make_all.bat` 더블클릭. 이미 만든 파일은 건너뛴다.

## 남편 목소리로 만들기 (선택)

1. 남편이 10~30초 정도 조용한 곳에서 한국어로 말하는 걸 녹음해 `tts` 폴더에 `voice.wav`로 저장한다. (mp3/m4a면 wav로 변환)
2. 녹음한 말을 그대로 글로 적어 둔다.
3. `tts` 폴더 주소창에 `cmd` 입력 → 엔터. 열린 창에:

```bat
.venv\Scripts\activate
python make_audio.py --test --force --ref voice.wav --ref-text "녹음한 말 그대로"
```

괜찮으면 `--test`를 빼고 실행하면 50개 전부.

## 자주 쓰는 옵션

| 옵션 | 뜻 |
|---|---|
| `--only 3,7,10-12` | 그 번호만 다시 만들기 (`--force`와 같이) |
| `--takes 3` | 문장마다 3가지 버전(`01_a`, `01_b`, `01_c`)을 만들어 제일 나은 걸 고르기 |
| `--voice "(...)"` | 목소리 설명 바꾸기 (괄호 포함, 영어) |
| `--force` | 이미 있는 파일도 덮어쓰기 |

## 다 만든 뒤

- 남편이 50개를 한 번씩 들어보고, 발음이 틀린 번호는 `--only 번호 --force`로 다시 만든다. AI 음성은 가끔 틀린다.
- `audio` 폴더를 ZIP으로 묶어 Claude에게 보내면 플래시카드에 붙인다.
- 오류가 나면 화면의 오류 메시지를 복사해서 Claude에게 보낸다.
