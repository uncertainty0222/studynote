import TelegramBot from 'node-telegram-bot-api';

let bot: TelegramBot | null = null;

function getBot(): TelegramBot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!bot) bot = new TelegramBot(token);
  return bot;
}

export async function sendTelegramAlert(message: string): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const instance = getBot();
  if (!instance || !chatId) {
    console.log('[Telegram] 봇 미설정, 콘솔 출력:', message);
    return;
  }
  try {
    await instance.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Telegram] 메시지 전송 실패:', err);
  }
}

export async function sendScanAlert(params: {
  symbol: string;
  timeframe: string;
  pattern: string;
  score: number;
  entry: number;
  target: number;
  stop: number;
  rr: number;
  reasoning: string;
  scanId: number;
}): Promise<void> {
  const scorePercent = Math.round(params.score * 100);
  const side = params.target > params.entry ? '롱 🟢' : '숏 🔴';
  const msg = [
    `🔍 *새 매매 기회 발견*`,
    ``,
    `*${params.symbol}* ${params.timeframe} | ${side}`,
    `패턴: ${params.pattern} | HaxKai 유사도: *${scorePercent}%*`,
    ``,
    `진입: $${params.entry.toFixed(4)}`,
    `목표: $${params.target.toFixed(4)}`,
    `손절: $${params.stop.toFixed(4)}`,
    `R:R = ${params.rr.toFixed(2)}:1`,
    ``,
    `📝 ${params.reasoning}`,
    ``,
    `ID: #${params.scanId} | /trading/setups 에서 승인`,
  ].join('\n');

  await sendTelegramAlert(msg);
}

export async function sendTradeExecutedAlert(params: {
  symbol: string;
  side: string;
  entry: number;
  quantity: number;
  riskUsdt: number;
}): Promise<void> {
  const msg = [
    `✅ *매매 실행됨*`,
    `${params.symbol} ${params.side} | 수량: ${params.quantity}`,
    `진입가: $${params.entry.toFixed(4)} | 리스크: $${params.riskUsdt.toFixed(2)}`,
  ].join('\n');
  await sendTelegramAlert(msg);
}

export async function sendDailyLimitAlert(lossUsdt: number, limitUsdt: number): Promise<void> {
  await sendTelegramAlert(
    `⛔ *일일 손실 한도 도달*\n현재 손실: $${lossUsdt.toFixed(2)} / 한도: $${limitUsdt.toFixed(2)}\n오늘 자동매매가 중단됩니다.`
  );
}
