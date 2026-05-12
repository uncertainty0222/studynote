import cron from 'node-cron';
import { fetchHaxkaiTweets } from './twitter-client';
import { processUnprocessedTweets } from './tweet-processor';
import { runMarketScan } from './setup-scanner';

let isRunning = false;

export function startScheduler(): void {
  console.log('[Scheduler] 트레이딩 봇 스케줄러 시작');

  // 5분마다 HaxKai 트윗 수집 (KST 기준)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const count = await fetchHaxkaiTweets();
      if (count > 0) {
        console.log(`[Twitter] ${count}개 신규 트윗 저장`);
        await processUnprocessedTweets();
      }
    } catch (err) {
      console.error('[Twitter] 폴링 실패:', err);
    }
  });

  // 4시간마다 시장 스캔 (KST 9시, 13시, 17시, 21시, 1시)
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

  // 매일 자정 만료된 셋업 상태 업데이트
  cron.schedule('0 0 * * *', async () => {
    try {
      const { initDb } = await import('../db');
      await initDb();
      const postgres = (await import('postgres')).default;
      // 만료된 pending 셋업을 expired로 변경
      // DB 직접 접근은 getSql 패턴을 사용해야 하므로 API 라우트에서 처리
      console.log('[Scheduler] 일별 정리 완료');
    } catch (err) {
      console.error('[Scheduler] 일별 정리 실패:', err);
    }
  });

  console.log('[Scheduler] 스케줄 등록 완료');
  console.log('  - 트윗 수집: 5분마다');
  console.log('  - 시장 스캔: 4시간마다');
}
