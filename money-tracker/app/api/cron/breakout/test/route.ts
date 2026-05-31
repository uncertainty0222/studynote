export const dynamic = 'force-dynamic';

// 텔레그램/푸시 채널 점검용 — 실제 돌파와 무관하게 테스트 메시지를 1회 보낸다.
// 보호: ?key=<CRON_SECRET>. 설정이 제대로 됐는지 확인할 때만 사용.

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  if (!secret || url.searchParams.get('key') !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const result: Record<string, unknown> = {
    telegramConfigured: Boolean(token && chatId),
  };

  if (token && chatId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ HaxKai 워처 테스트 — 텔레그램 알림이 정상 작동합니다.',
        }),
      });
      result.telegramSent = res.ok;
      if (!res.ok) result.telegramError = await res.text().catch(() => '');
    } catch (e) {
      result.telegramSent = false;
      result.telegramError = e instanceof Error ? e.message : String(e);
    }
  }

  return Response.json({ ok: true, ...result });
}
