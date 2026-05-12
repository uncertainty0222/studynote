import 'dotenv/config';
import { initDb } from '../lib/db';
import { startScheduler } from '../lib/trading/scheduler';
import { sendTelegramAlert } from '../lib/trading/telegram-notifier';

async function main() {
  console.log('=== HaxKai 트레이딩 봇 워커 시작 ===');
  console.log(`시작 시각: ${new Date().toISOString()}`);
  console.log(`TRADING_ENABLED: ${process.env.TRADING_ENABLED}`);

  try {
    await initDb();
    console.log('[DB] 연결 및 테이블 초기화 완료');
  } catch (err) {
    console.error('[DB] 초기화 실패:', err);
    process.exit(1);
  }

  await sendTelegramAlert('🤖 HaxKai 트레이딩 봇이 시작됐습니다.');

  startScheduler();

  process.on('SIGTERM', async () => {
    console.log('[Worker] SIGTERM 수신 — 종료 중...');
    await sendTelegramAlert('⚠️ 트레이딩 봇이 종료됩니다 (SIGTERM).');
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    console.error('[Worker] 예외 발생:', err);
  });
}

main().catch((err) => {
  console.error('[Worker] 치명적 오류:', err);
  process.exit(1);
});
