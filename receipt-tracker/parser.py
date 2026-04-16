import base64
import json
import re
from pathlib import Path

import anthropic

client = anthropic.Anthropic()

SYSTEM_PROMPT = """너는 영수증 이미지를 분석해서 가계부 데이터를 추출하는 전문가야.
영수증에서 다음 정보를 정확하게 추출해서 JSON으로만 응답해줘. 다른 텍스트는 절대 포함하지 마.

응답 형식:
{
  "receipt_date": "YYYY-MM-DD",
  "merchant": "가게명",
  "category": "카테고리",
  "items": [{"name": "상품명", "price": 숫자}],
  "total": 숫자
}

카테고리는 반드시 다음 중 하나로 분류해:
- 식비 (음식점, 편의점 음식, 배달)
- 카페/음료 (카페, 음료, 베이커리)
- 교통 (대중교통, 주유, 택시)
- 쇼핑 (의류, 잡화, 온라인쇼핑)
- 생활용품 (마트, 약국 생활용품, 청소용품)
- 의료/건강 (병원, 약국 의약품, 헬스)
- 문화/여가 (영화, 게임, 책, 구독)
- 기타

날짜가 없으면 오늘 날짜 사용. 금액은 숫자만(원 단위, 쉼표 없이).
이미지가 영수증이 아니면: {"error": "영수증이 아닙니다"}"""


def encode_image(image_path: str) -> tuple[str, str]:
    path = Path(image_path)
    suffix = path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    media_type = media_types.get(suffix, "image/jpeg")
    with open(path, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")
    return data, media_type


def parse_receipt(image_path: str) -> dict:
    image_data, media_type = encode_image(image_path)

    message = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {"type": "text", "text": "이 영수증을 분석해줘."},
                ],
            }
        ],
    )

    raw = message.content[0].text.strip()

    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not json_match:
        return {"error": "파싱 실패: JSON을 찾을 수 없음"}

    try:
        return json.loads(json_match.group())
    except json.JSONDecodeError:
        return {"error": "파싱 실패: JSON 형식 오류"}
