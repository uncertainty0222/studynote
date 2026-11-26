import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth';
import { createTransaction } from '@/lib/db';
import { broadcastUpdate } from '@/lib/broadcast';
import { sendPushToRole } from '@/lib/push';
import { parseVoiceEntry, todayInVietnam } from '@/lib/voiceEntry';
import { getUserByVoiceToken } from '@/lib/voiceToken';

export const dynamic = 'force-dynamic';

// POST { text } — from the in-app mic (session cookie) or the Siri Shortcut (Bearer token).
// ?format=text returns one plain sentence, which the Shortcut can show or speak.
export async function POST(request: Request) {
  const asText = new URL(request.url).searchParams.get('format') === 'text';
  const reply = (ok: boolean, message: string, extra: object = {}, status = ok ? 201 : 400) =>
    asText
      ? new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      : Response.json({ ok, message, ...extra }, { status });

  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const user = bearer ? await getUserByVoiceToken(bearer) : await getAuthUser();
  if (!user) return reply(false, '인증에 실패했어요. 단축어 키를 다시 확인해주세요.', {}, 401);

  const body = await request.json().catch(() => ({})) as { text?: string };
  const text = (body.text ?? '').trim();
  if (!text) return reply(false, '말한 내용이 비어 있어요.');
  if (text.length > 1000) return reply(false, '너무 길어요. 한 건씩 말해주세요.');

  if (!process.env.ANTHROPIC_API_KEY) return reply(false, 'ANTHROPIC_API_KEY가 설정되지 않았어요.', {}, 503);

  let entry;
  try {
    entry = await parseVoiceEntry(text, { today: todayInVietnam(), speaker: user.role });
  } catch (e) {
    const msg = e instanceof Anthropic.RateLimitError ? 'AI가 잠시 바빠요. 조금 뒤에 다시 말해주세요.'
      : e instanceof Anthropic.APIError ? `AI 연결 오류 (${e.status ?? '?'})`
      : '내용을 정리하지 못했어요. 다시 말해주세요.';
    return reply(false, msg, {}, 502);
  }

  if (!entry.understood || entry.amount_vnd <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    return reply(false, entry.problem_ko || '금액이나 내용을 알아듣지 못했어요. 다시 말해주세요.', { entry }, 422);
  }

  const payer: 'husband' | 'wife' = entry.direction === 'IN' ? 'husband' : 'wife';
  const transaction = await createTransaction({
    payer,
    amount: entry.amount_vnd,
    memo: entry.title_vi.trim().slice(0, 200),
    note: entry.memo_ko.trim().slice(0, 500),
    date: entry.date,
    created_by: user.role,
  });

  broadcastUpdate();
  const partnerRole: 'husband' | 'wife' = user.role === 'husband' ? 'wife' : 'husband';
  const senderName = user.role === 'husband' ? '남편' : '아내';
  const amountStr = entry.amount_vnd.toLocaleString('ko-KR');
  sendPushToRole(partnerRole, '우리 가계부 🔔', `${senderName}이(가) 새 거래를 요청했어요\n${entry.title_vi} — ${amountStr}₫`).catch(() => {});

  return reply(true, `${entry.direction} ${amountStr}₫ 올렸어요 · ${entry.memo_ko}`, { entry, transaction });
}
