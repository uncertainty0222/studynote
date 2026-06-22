// lib/breakoutWatch.ts
// HaxKai 돌파 워처 — "직전 *마감된* 봉의 종가가 트리거선 위인가"를 확인하고,
// 처음 충족되는 순간 1회 푸시 알림을 보낸다. 주문은 사용자가 직접 넣는다(자동 진입 없음).
//
// 휘발성 컨테이너가 아니라 상시 가동되는 Railway 서버(money-tracker)에서 동작.
// 외부 cron이 /api/cron/breakout 를 주기적으로 깨우면 이 로직이 실행된다.

import { getConfigValue, setConfigValue } from './db';
import { sendPushToRole } from './push';

// 알림 전송 — 텔레그램(설정 시) + 웹푸시(설정 시). 둘 다 있으면 둘 다 보냄.
// 텔레그램이 설정이 가장 간단하므로 권장 경로.
async function notify(title: string, body: string): Promise<{ telegram: boolean; push: boolean }> {
  const sent = { telegram: false, push: false };
  const text = `${title}\n${body}`;

  // 1) 텔레그램
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      sent.telegram = res.ok;
    } catch {
      sent.telegram = false;
    }
  }

  // 2) 웹푸시 (구독이 있으면)
  const role = (process.env.WATCH_PUSH_ROLE as 'husband' | 'wife') || 'husband';
  try {
    await sendPushToRole(role, title, body);
    sent.push = true;
  } catch {
    sent.push = false;
  }
  return sent;
}

// 감시 셋업 정의 — 현재는 FOLKS 단일. 추후 다중 확장 시 배열로.
export interface WatchSetup {
  symbol: string;        // Binance USDⓈ-M perp 심볼 (예: FOLKSUSDT)
  label: string;         // 알림에 표시할 이름 (예: $FOLKS)
  interval: string;      // 봉 기준 (예: '1d')
  trigger: number;       // 돌파 기준선 (마감 종가가 이 위면 발동)
  entry: number;         // 권장 진입가 (= 트리거선, 돌파 마감 후)
  sl: number;            // 손절가 (Breakout sl)
  risk: number;          // 1R 리스크 ($)
  tps: number[];         // 익절 타겟들
  weeklyConfirm?: boolean; // true면: 일봉으로 빨리 포착하되, Kai가 원하는 주봉 마감까지 남은 시간을 알림에 함께 표시
}

export const FOLKS_1D: WatchSetup = {
  symbol: 'FOLKSUSDT',
  label: '$FOLKS',
  interval: '1d',
  trigger: 1.461,
  entry: 1.461,
  sl: 1.304,
  risk: 250,
  tps: [1.718, 2.043, 2.248], // 1.461 진입 시 1.450은 이미 지났으므로 TP1=1.718
};

// CLO — "0.24 위 일봉 몸통 마감" 확인 후 진입 (HaxKai 교육 트윗 기준).
// 현재가 0.196은 저항 0.24 아래 + 주봉 윗꼬리(유동성 사냥) → 마감 확인 전엔 진입 금지.
export const CLO_1D: WatchSetup = {
  symbol: 'CLOUSDT',
  label: '$CLO',
  interval: '1d',
  trigger: 0.24036,         // 파란 Breakout 저항선
  entry: 0.24036,
  sl: 0.12394,              // 빨간 SL
  risk: 250,
  tps: [0.30873, 0.41952, 0.63754, 1.10002], // 초록 타겟들
};

// AERO — Kai는 "주봉 0.60 마감"을 요구하지만, 인화 요청대로 일봉 마감으로 빨리 포착하고
// 알림에 주봉 마감까지 남은 시간을 함께 표시한다. (트리거는 Kai의 매크로 레벨 0.60)
export const AERO_1D: WatchSetup = {
  symbol: 'AEROUSDT',
  label: '$AERO',
  interval: '1d',
  trigger: 0.6002,          // 파란 주봉 돌파선 (Kai 매크로 레벨)
  entry: 0.6002,
  sl: 0.3674,               // 빨간 SL (진입 시 재계산 권장)
  risk: 250,
  tps: [1.7576, 3.6230],    // 초록 타겟들
  weeklyConfirm: true,      // 주봉 마감까지 남은 시간 함께 알림
};

const FAPI = 'https://fapi.binance.com';

// 다음 주봉 마감까지 남은 시간 (바이낸스 주봉은 월요일 00:00 UTC 시작/마감).
function timeToWeeklyClose(now = Date.now()): string {
  const d = new Date(now);
  const dow = d.getUTCDay();              // 0=일,1=월,...
  // 다음 월요일 00:00 UTC 까지
  const daysUntilMon = (8 - dow) % 7 || 7; // 월요일이면 7일 뒤(이번 주 마감), 그 외엔 다음 월요일
  const nextClose = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMon, 0, 0, 0);
  const ms = nextClose - now;
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  return `${days}일 ${hours}시간 ${mins}분`;
}

interface CheckResult {
  symbol: string;
  interval: string;
  lastClosedClose: number | null;
  lastClosedOpenTime: number | null;
  triggered: boolean;     // 직전 마감봉이 트리거 위인가
  fired: boolean;         // 이번 호출에서 새로 알림을 보냈는가
  reason: string;
}

// 직전에 "마감된" 봉 1개를 가져온다.
// klines는 마지막 원소가 "현재 진행 중(미마감)" 봉이므로, 끝에서 두 번째가 마지막 마감봉.
async function fetchLastClosedCandle(symbol: string, interval: string) {
  const url = `${FAPI}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=2`;
  const res = await fetch(url, { headers: { 'User-Agent': 'hax-watch' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`klines HTTP ${res.status}: ${body.slice(0, 120)}`);
  }
  const rows = (await res.json()) as unknown[][];
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error(`klines 응답 부족 (len=${Array.isArray(rows) ? rows.length : 'n/a'})`);
  }
  const lastClosed = rows[rows.length - 2]; // [openTime, open, high, low, close, ...]
  return {
    openTime: Number(lastClosed[0]),
    close: Number(lastClosed[4]),
  };
}

// 켈리/사이징과 동일한 수량 공식 (hax.mjs와 일치)
function sizing(s: WatchSetup) {
  const stopDist = Math.abs(s.entry - s.sl);
  const qty = s.risk / stopDist;
  const notional = qty * s.entry;
  const tp1R = (s.tps[0] - s.entry) / stopDist;
  return { stopDist, qty, notional, tp1R };
}

function fmt(n: number, d = 4) {
  return Number.isFinite(n) ? n.toFixed(d) : String(n);
}

// 단일 셋업 확인 — 트리거선을 위/아래로 "교차"할 때마다 알림 (상향 돌파 + 하향 이탈 둘 다).
// 상태(above/below)를 저장하고, 직전 마감봉에서 상태가 바뀌었을 때만 1회 알림.
export async function checkSetup(s: WatchSetup): Promise<CheckResult> {
  // state 값: "above:<openTime>" 또는 "below:<openTime>" 형태로 저장
  const stateKey = `breakout_state:${s.symbol}:${s.interval}:${s.trigger}`;
  const candle = await fetchLastClosedCandle(s.symbol, s.interval);
  const triggered = candle.close > s.trigger;
  const nowState = triggered ? 'above' : 'below';

  const base: CheckResult = {
    symbol: s.symbol,
    interval: s.interval,
    lastClosedClose: candle.close,
    lastClosedOpenTime: candle.openTime,
    triggered,
    fired: false,
    reason: '',
  };

  const prevRaw = await getConfigValue(stateKey);          // 예: "above:1781913600000"
  const prevState = prevRaw ? prevRaw.split(':')[0] : null; // "above" | "below" | null
  const prevOpenTime = prevRaw ? prevRaw.split(':')[1] : null;

  // 상태 변화 없음 → 조용 (단, 같은 봉 재호출도 여기서 걸러짐)
  if (prevState === nowState) {
    base.reason = `상태 유지 (${nowState}) — 종가 ${fmt(candle.close)} vs 트리거 ${fmt(s.trigger)}`;
    return base;
  }

  // 첫 관측(prev 없음)인데 아직 아래면, 알림 없이 상태만 기록 (돌파 대기 시작점)
  if (prevState === null && nowState === 'below') {
    await setConfigValue(stateKey, `${nowState}:${candle.openTime}`);
    base.reason = `감시 시작 — 현재 트리거 아래 (종가 ${fmt(candle.close)})`;
    return base;
  }

  // 안전장치: 같은 봉(openTime)에 대해선 중복 알림 금지
  if (prevOpenTime === String(candle.openTime)) {
    base.reason = `이미 처리된 봉 (openTime ${candle.openTime})`;
    return base;
  }

  // 여기 도달 = 상태가 바뀜 → 교차 알림
  const { qty, notional, tp1R } = sizing(s);
  let title: string;
  let body: string;

  if (nowState === 'above') {
    // 상향 돌파
    title = `🔔 ${s.label} 상향 돌파 마감! (${s.interval})`;
    const weeklyLine = s.weeklyConfirm
      ? `\n⏳ Kai는 주봉 마감 확인 권장 — 주봉 마감까지 ${timeToWeeklyClose()} 남음 (그때 종가가 ${fmt(s.trigger)} 위인지 재확인)`
      : '';
    body =
      `종가 ${fmt(candle.close)} > 트리거 ${fmt(s.trigger)}\n` +
      `진입 ${fmt(s.entry)} / 손절 ${fmt(s.sl)} (1R=$${s.risk})\n` +
      `수량 ${qty.toFixed(0)} · 명목 $${notional.toFixed(0)} · TP1 ${fmt(s.tps[0])} (+${tp1R.toFixed(2)}R)` +
      weeklyLine + `\n※ 직접 주문 넣고, 진입과 동시에 SL 등록할 것.`;
  } else {
    // 하향 이탈
    title = `🔻 ${s.label} 하향 이탈 마감 (${s.interval})`;
    body =
      `종가 ${fmt(candle.close)} < 트리거 ${fmt(s.trigger)}\n` +
      `돌파가 무효화됨 — 트리거선 아래로 마감. 진입 보류/관망.`;
  }

  const sent = await notify(title, body);
  await setConfigValue(stateKey, `${nowState}:${candle.openTime}`);

  base.fired = true;
  const ch = [sent.telegram ? '텔레그램' : null, sent.push ? '웹푸시' : null].filter(Boolean).join('+') || '없음(채널 미설정)';
  base.reason = `${nowState === 'above' ? '상향 돌파' : '하향 이탈'} — 알림 발송 [${ch}] (종가 ${fmt(candle.close)} vs ${fmt(s.trigger)})`;
  return base;
}

// 등록된 모든 셋업 확인 (현재 FOLKS 단일)
export async function runWatch(): Promise<CheckResult[]> {
  const setups = [CLO_1D, AERO_1D];
  const results: CheckResult[] = [];
  for (const s of setups) {
    try {
      results.push(await checkSetup(s));
    } catch (e) {
      results.push({
        symbol: s.symbol, interval: s.interval, lastClosedClose: null,
        lastClosedOpenTime: null, triggered: false, fired: false,
        reason: `오류: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return results;
}
