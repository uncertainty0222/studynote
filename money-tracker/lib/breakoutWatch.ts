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

const FAPI = 'https://fapi.binance.com';

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

// 단일 셋업 확인 + (충족 & 미발송이면) 알림
export async function checkSetup(s: WatchSetup): Promise<CheckResult> {
  const stateKey = `breakout_fired:${s.symbol}:${s.interval}:${s.trigger}`;
  const candle = await fetchLastClosedCandle(s.symbol, s.interval);
  const triggered = candle.close > s.trigger;

  const base: CheckResult = {
    symbol: s.symbol,
    interval: s.interval,
    lastClosedClose: candle.close,
    lastClosedOpenTime: candle.openTime,
    triggered,
    fired: false,
    reason: '',
  };

  if (!triggered) {
    // 트리거 아래로 다시 내려오면 상태 리셋 → 다음 돌파 때 재알림 가능
    const prev = await getConfigValue(stateKey);
    if (prev) await setConfigValue(stateKey, '');
    base.reason = `직전 마감 종가 ${fmt(candle.close)} ≤ 트리거 ${fmt(s.trigger)}`;
    return base;
  }

  // 이미 이 봉(openTime)에 대해 알림을 보냈으면 중복 방지
  const firedFor = await getConfigValue(stateKey);
  if (firedFor === String(candle.openTime)) {
    base.reason = `이미 알림 발송됨 (openTime ${candle.openTime})`;
    return base;
  }

  // 새 돌파 → 알림 1회
  const { qty, notional, tp1R } = sizing(s);
  const title = `🔔 ${s.label} 돌파 마감! (${s.interval})`;
  const body =
    `종가 ${fmt(candle.close)} > 트리거 ${fmt(s.trigger)}\n` +
    `진입 ${fmt(s.entry)} / 손절 ${fmt(s.sl)} (1R=$${s.risk})\n` +
    `수량 ${qty.toFixed(0)} · 명목 $${notional.toFixed(0)} · TP1 ${fmt(s.tps[0])} (+${tp1R.toFixed(2)}R)\n` +
    `※ 직접 주문 넣고, 진입과 동시에 SL 등록할 것.`;

  const sent = await notify(title, body);
  await setConfigValue(stateKey, String(candle.openTime));

  base.fired = true;
  const ch = [sent.telegram ? '텔레그램' : null, sent.push ? '웹푸시' : null].filter(Boolean).join('+') || '없음(채널 미설정)';
  base.reason = `돌파 발동 — 알림 발송 [${ch}] (종가 ${fmt(candle.close)} > ${fmt(s.trigger)})`;
  return base;
}

// 등록된 모든 셋업 확인 (현재 FOLKS 단일)
export async function runWatch(): Promise<CheckResult[]> {
  const setups = [FOLKS_1D, CLO_1D];
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
