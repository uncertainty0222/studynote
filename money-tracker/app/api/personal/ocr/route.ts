import { getAuthUser } from '@/lib/auth';

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다' }, { status: 503 });

  const { image } = await request.json(); // base64 JPEG
  if (!image) return Response.json({ error: '이미지가 없습니다' }, { status: 400 });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: `영수증에서 다음 정보를 추출해서 JSON으로만 응답하세요 (설명 없이):
{"date":"YYYY-MM-DD","merchant":"상호명","amount":숫자,"currency":"VND|KRW|USD","category":"외식|생활비|교통|쇼핑|주거|의료|카페|구독|교육|기타","items":[{"name":"항목명","price":숫자}]}
날짜가 없거나 불명확하면 오늘 날짜, 금액은 최종 합계 금액, 화폐단위는 영수증 기준으로 판단.` },
        ],
      }],
    }),
  });

  if (!res.ok) return Response.json({ error: 'OCR 실패' }, { status: 500 });
  const data = await res.json() as { content: { text: string }[] };
  try {
    const text = data.content[0].text.trim().replace(/```json\n?|\n?```/g, '');
    const parsed = JSON.parse(text);
    return Response.json(parsed);
  } catch {
    return Response.json({ error: '파싱 실패 - 수동 입력해주세요' }, { status: 422 });
  }
}
