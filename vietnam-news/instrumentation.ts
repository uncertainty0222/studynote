// 서버가 켜질 때 한 번 실행된다: 매주 일요일 '일주일' 순위 자동 생성을 시작한다
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWeeklyScheduler } = await import("./lib/rankings");
    startWeeklyScheduler();
  }
}
