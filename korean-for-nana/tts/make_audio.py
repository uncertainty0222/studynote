"""VoxCPM2로 50문장 음성 파일을 만든다. NVIDIA GPU가 있는 PC에서 실행.

사용법은 같은 폴더의 README.md 참고.
결과: audio/01.wav ~ audio/50.wav (번호 = src/data.py 순서)
"""
import argparse
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

DEFAULT_VOICE = "(A friendly Korean woman in her thirties, standard Seoul accent, speaking slowly and clearly)"


def load_sentences():
    spec = importlib.util.spec_from_file_location("data", HERE.parent / "src" / "data.py")
    data = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(data)
    return [ko for ko, _, _, _ in data.TOP50]


def parse_only(s, total):
    nums = set()
    for part in s.split(","):
        a, _, b = part.strip().partition("-")
        nums.update(range(int(a), int(b or a) + 1))
    bad = [n for n in nums if not 1 <= n <= total]
    if bad:
        sys.exit(f"--only 번호는 1~{total} 사이여야 합니다: {sorted(bad)}")
    return sorted(nums)


def main():
    p = argparse.ArgumentParser(description="50문장 음성 생성 (VoxCPM2)")
    p.add_argument("--out", default=str(HERE / "audio"), help="저장 폴더 (기본: tts/audio)")
    p.add_argument("--only", help="이 번호만 생성. 예: 3,7,10-12")
    p.add_argument("--test", action="store_true", help="1번 문장만 만들어 보기")
    p.add_argument("--takes", type=int, default=1, help="문장마다 몇 가지 버전을 만들지 (골라 쓰기용)")
    p.add_argument("--ref", help="목소리 복제용 녹음 파일 (wav). 없으면 --voice 설명으로 목소리 생성")
    p.add_argument("--ref-text", help="--ref 녹음의 정확한 대본. 주면 복제 정확도가 올라감")
    p.add_argument("--voice", default=DEFAULT_VOICE, help="--ref 없을 때 쓰는 목소리 설명 (괄호 포함, 영어 권장)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--device", default="auto", help="auto / cuda / cpu")
    p.add_argument("--force", action="store_true", help="이미 있는 파일도 다시 생성")
    args = p.parse_args()

    if args.ref_text and not args.ref:
        sys.exit("--ref-text는 --ref와 같이 써야 합니다.")
    if args.ref and not Path(args.ref).is_file():
        sys.exit(f"녹음 파일이 없습니다: {args.ref}")

    sentences = load_sentences()
    nums = [1] if args.test else parse_only(args.only, len(sentences)) if args.only else range(1, len(sentences) + 1)

    import soundfile as sf
    import torch
    from voxcpm import VoxCPM

    if args.device in ("auto", "cuda") and not torch.cuda.is_available():
        print("경고: CUDA GPU를 찾지 못했습니다. CPU로 실행되며 매우 느릴 수 있습니다.", file=sys.stderr)

    # torch.compile은 Windows에서 실패하는 경우가 있어 끈다. 50문장이면 속도 차이는 크지 않다.
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, optimize=False,
                                   device=None if args.device == "auto" else args.device)
    sr = model.tts_model.sample_rate

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for n in nums:
        ko = sentences[n - 1]
        for t in range(args.takes):
            name = f"{n:02d}.wav" if args.takes == 1 else f"{n:02d}_{chr(ord('a') + t)}.wav"
            path = out / name
            if path.exists() and not args.force:
                print(f"건너뜀 (이미 있음): {name}")
                continue
            torch.manual_seed(args.seed + n * 100 + t)
            kw = dict(cfg_value=2.0, inference_timesteps=10)
            if args.ref:
                kw["reference_wav_path"] = args.ref
                if args.ref_text:
                    kw.update(prompt_wav_path=args.ref, prompt_text=args.ref_text)
                text = ko
            else:
                text = args.voice + ko
            wav = model.generate(text=text, **kw)
            sf.write(path, wav, sr)
            print(f"저장: {name}  {ko}")

    print(f"\n완료. 폴더: {out}")


if __name__ == "__main__":
    main()
