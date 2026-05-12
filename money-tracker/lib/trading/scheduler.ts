import cron from 'node-cron';
import { runMarketScan } from './setup-scanner';

let isRunning = false;

export function startScheduler(): void {
  console.log('[Scheduler] 트레이딩 봇 스케줄러 시작');

  // 4시간마다 시장 스캔 (UTC 0, 4, 8, 12, 16, 20시 = KST 9, 13, 17, 21, 1, 5시)
  cron.schedule('0 0,4,8,12,16,20 * * *', async () => {
    if (isRunning) {
      console.log('[Scanner] 이전 스캔 실행 중 — 건너뜀');
      return;
    }
    isRunning = true;
    try {
      console.log('[Scanner] 시장 스캔 시작...');
      const result = await runMarketScan();
      console.log(`[Scanner] 완료: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error('[Scanner] 스캔 실패:', err);
    } finally {
      isRunning = false;
    }
  });

  // 매일 자정 만료된 셋업 정리 로그
  cron.schedule('0 0 * * *', () => {
    console.log('[Scheduler] 일별 정리 실행');
  });

  console.log('[Scheduler] 스케줄 등록 완료');
  console.log('  - 시장 스캔: 4시간마다 (KST 9/13/17/21/1/5시)');
  console.log('  - 트윗 분석: 사용자가 /trading 에서 URL 입력 시 즉시 실행');
}
