#!/usr/bin/env node
// hax.mjs — HaxKai 트레이딩 어시스턴트 CLI (의존성 0, Node 18+ 글로벌 fetch)
//
//   node trading/hax.mjs market <SYMBOL> [--tf 4h,1d] [--limit 200]
//   node trading/hax.mjs size --entry <p> --sl <p> --risk <$> [옵션]
//
// 데이터: Binance USDⓈ-M 선물 공개 API (키 불필요). 이 환경의 네트워크
// 허용목록에 fapi.binance.com 이 있어야 동작한다. README 참고.

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FAPI = 'https://fapi.binance.com';
const JOURNAL = process.env.HAX_JOURNAL || join(dirname(fileURLToPath(import.meta.url)), 'journal.jsonl');

// ── 공통 유틸 ────────────────────────────────────────────────
function normSymbol(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toUpperCase().replace(/^\$/, '');
  s = s.replace(/USDT\.P$/, 'USDT').replace(/\.P$/, '');
  if (!s.endsWith('USDT')) s += 'USDT';
  return s;
}

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[key] = true; }
      else { out[key] = next; i++; }
    } else if (out._pos === undefined) {
      out._pos = a;
    }
  }
  return out;
}

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; }

// 가격을 유효숫자 보존하며 보기 좋게
function fmtPrice(p) {
  if (!Number.isFinite(p)) return String(p);
  const abs = Math.abs(p);
  if (abs >= 1000) return p.toFixed(2);
  if (abs >= 1) return p.toFixed(4);
  if (abs >= 0.01) return p.toFixed(5);
  return p.toPrecision(5);
}
function fmtUsd(v) { return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function pct(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; }

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'hax-cli' } });
  } catch (e) {
    const msg = String(e?.message || e);
    if (/allowlist|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(msg)) {
      throw new Error(
        `네트워크 차단됨 (${msg}).\n` +
        `→ 이 환경의 네트워크 허용목록에 fapi.binance.com 을 추가해야 합니다.\n` +
        `  문서: https://code.claude.com/docs/en/claude-code-on-the-web`
      );
    }
    throw e;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (/allowlist/i.test(body) || res.status === 403) {
      throw new Error(
        `네트워크 차단됨 (HTTP ${res.status}: ${body.slice(0, 80).trim()}).\n` +
        `→ 이 환경의 네트워크 허용목록에 fapi.binance.com 을 추가해야 합니다.\n` +
        `  문서: https://code.claude.com/docs/en/claude-code-on-the-web`
      );
    }
    throw new Error(`HTTP ${res.status} ${url}\n${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── ASCII 스파크라인 ────────────────────────────────────────
function sparkline(values) {
  const ticks = '▁▂▃▄▅▆▇█';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  return values.map(v => ticks[Math.min(7, Math.floor(((v - min) / span) * 7.999))]).join('');
}

// 캔들에서 국소 극값(스윙 고/저) 찾기
function swings(klines, lookback = 2) {
  const highs = [], lows = [];
  for (let i = lookback; i < klines.length - lookback; i++) {
    const h = klines[i].high, l = klines[i].low;
    let isHigh = true, isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (klines[j].high >= h) isHigh = false;
      if (klines[j].low <= l) isLow = false;
    }
    if (isHigh) highs.push(h);
    if (isLow) lows.push(l);
  }
  return { highs, lows };
}

function atr(klines, period = 14) {
  const trs = [];
  for (let i = 1; i < klines.length; i++) {
    const c = klines[i], p = klines[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((s, x) => s + x, 0) / (slice.length || 1);
}

// ── market 커맨드 ───────────────────────────────────────────
async function cmdMarket(flags) {
  const symbol = normSymbol(flags._pos);
  if (!symbol) { console.error('사용법: node trading/hax.mjs market <SYMBOL>'); process.exit(1); }
  const tfs = String(flags.tf || '4h,1d').split(',').map(s => s.trim()).filter(Boolean);
  const limit = Math.min(1000, Math.max(20, parseInt(flags.limit) || 200));

  const [ticker, premium] = await Promise.all([
    getJson(`${FAPI}/fapi/v1/ticker/24hr?symbol=${symbol}`),
    getJson(`${FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`).catch(() => null),
  ]);

  const price = num(ticker.lastPrice);
  const out = [];
  out.push(`━━━ ${symbol} (Binance USDⓈ-M 무기한) ━━━`);
  out.push(`현재가      ${fmtPrice(price)}   24h ${pct(num(ticker.priceChangePercent))}`);
  out.push(`24h 고/저   ${fmtPrice(num(ticker.highPrice))} / ${fmtPrice(num(ticker.lowPrice))}`);
  out.push(`24h 거래량  ${num(ticker.quoteVolume).toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT`);
  if (premium) {
    const fr = num(premium.lastFundingRate) * 100;
    out.push(`마크가      ${fmtPrice(num(premium.markPrice))}   펀딩비 ${pct(fr)} / 8h`);
  }

  for (const tf of tfs) {
    let raw;
    try { raw = await getJson(`${FAPI}/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`); }
    catch (e) { out.push(`\n[${tf}] 조회 실패: ${e.message}`); continue; }
    const k = raw.map(r => ({ open: +r[1], high: +r[2], low: +r[3], close: +r[4], vol: +r[5] }));
    const closes = k.map(c => c.close);
    const hi = Math.max(...k.map(c => c.high)), lo = Math.min(...k.map(c => c.low));
    const range = hi - lo || 1;
    const posInRange = ((price - lo) / range) * 100;
    const a = atr(k);
    const { highs, lows } = swings(k);
    // 현재가 기준 근접 저항(위)·지지(아래)
    const resAbove = [...new Set(highs.filter(h => h > price))].sort((x, y) => x - y).slice(0, 3);
    const supBelow = [...new Set(lows.filter(l => l < price))].sort((x, y) => y - x).slice(0, 3);

    out.push(`\n[${tf}]  ${sparkline(closes.slice(-60))}`);
    out.push(`  레인지(${k.length}봉) ${fmtPrice(lo)} ─ ${fmtPrice(hi)}   현재 위치 ${posInRange.toFixed(0)}%`);
    out.push(`  ATR(14) ${fmtPrice(a)} (${(a / price * 100).toFixed(2)}%)`);
    out.push(`  근접 저항 ↑ ${resAbove.map(fmtPrice).join('  ') || '—'}`);
    out.push(`  근접 지지 ↓ ${supBelow.map(fmtPrice).join('  ') || '—'}`);
  }
  out.push(`\n⚠ HaxKai가 차트에 직접 그린 손절·타겟 선은 API에 없음 — 별도로 알려줄 것.`);
  console.log(out.join('\n'));
}

// ── size 커맨드 ─────────────────────────────────────────────
function liqPrice(entry, lev, side, mmr = 0.005) {
  // Binance 격리 추정치. 정확한 청산가는 유지증거금률·수수료에 따라 다름.
  return side === 'short'
    ? entry * (1 + 1 / lev - mmr)
    : entry * (1 - 1 / lev + mmr);
}

function cmdSize(flags) {
  const entry = num(flags.entry);
  const sl = num(flags.sl);
  const risk = num(flags.risk);
  const side = (flags.side === 'short') ? 'short' : 'long';
  const seed = num(flags.seed) || 5000;
  if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(risk)) {
    console.error('사용법: node trading/hax.mjs size --entry <가격> --sl <가격> --risk <$> [--tp1 .. --p 0.55 --side long|short --seed 5000]');
    process.exit(1);
  }
  const stopDist = Math.abs(entry - sl);
  const stopPct = stopDist / entry * 100;
  const slOk = side === 'long' ? sl < entry : sl > entry;
  const qty = risk / stopDist;
  const notional = qty * entry;

  const out = [];
  out.push(`━━━ 포지션 사이징 (${side.toUpperCase()}) ━━━`);
  if (!slOk) out.push(`⚠ 손절가 방향 오류: ${side} 인데 SL(${fmtPrice(sl)})이 진입가(${fmtPrice(entry)}) 반대편.`);
  out.push(`진입 ${fmtPrice(entry)}   손절 ${fmtPrice(sl)}   손절폭 ${fmtPrice(stopDist)} (${stopPct.toFixed(2)}%)`);
  out.push(`1R = ${fmtUsd(risk)}  →  수량 ${qty.toLocaleString('en-US', { maximumFractionDigits: 2 })}   명목가치 ${fmtUsd(notional)}`);
  const riskPctSeed = risk / seed * 100;
  out.push(`시드 대비 리스크 ${riskPctSeed.toFixed(1)}% ${riskPctSeed > 2 ? '⚠ (권장 1~2% 초과)' : '✓'}`);

  // 레버리지 표
  out.push(`\n레버리지   증거금     청산가(추정)   SL 대비`);
  for (const lev of [2, 3, 5, 7, 10]) {
    const margin = notional / lev;
    const liq = liqPrice(entry, lev, side);
    // 청산이 손절보다 먼저 오는가?
    const liqBeforeSL = side === 'long' ? liq >= sl : liq <= sl;
    const flag = liqBeforeSL ? '⛔ 청산이 SL보다 먼저!' : (Math.abs(liq - sl) / entry < 0.03 ? '⚠ 근접' : '✓');
    out.push(`  ${lev}x       ${fmtUsd(margin).padEnd(9)}  ${fmtPrice(liq).padEnd(12)}  ${flag}`);
  }

  // TP별 R배수
  const tps = [];
  for (const key of ['tp1', 'tp2', 'tp3', 'tp4']) {
    if (flags[key] !== undefined) { const v = num(flags[key]); if (Number.isFinite(v)) tps.push([key, v]); }
  }
  if (tps.length) {
    out.push(`\nTP        가격          R배수`);
    for (const [k, v] of tps) {
      const reward = side === 'long' ? v - entry : entry - v;
      const r = reward / stopDist;
      const flag = k === 'tp1' ? (r < 1 ? ' ⚠ TP1 < +1R (분할 50% 회수 부족)' : ' ✓') : '';
      out.push(`  ${k.toUpperCase()}     ${fmtPrice(v).padEnd(12)}  ${r >= 0 ? '+' : ''}${r.toFixed(2)}R${flag}`);
    }
  }

  // 켈리 — TP1을 R로 사용 (이항 근사), p가 주어진 경우
  if (flags.p !== undefined && tps.length) {
    const p = num(flags.p);
    const R = (side === 'long' ? tps[0][1] - entry : entry - tps[0][1]) / stopDist;
    const breakeven = 1 / (1 + R) * 100;
    out.push(`\n━━━ 켈리 (TP1 손익비 R=${R.toFixed(2)} 이항 근사) ━━━`);
    out.push(`손익분기 승률 ${breakeven.toFixed(1)}%   입력 승률 ${(p * 100).toFixed(1)}%`);
    if (p > 1 || p < 0) { out.push(`⚠ 승률은 0~1 사이로 (예: 0.55)`); }
    else {
      const f = p - (1 - p) / R;
      if (f <= 0) {
        out.push(`켈리 f* = ${f.toFixed(3)}  →  ⛔ 음의 기댓값. 이 손익비·승률 조합은 베팅 금지.`);
      } else {
        out.push(`켈리 f* = ${(f * 100).toFixed(1)}%   하프 ${(f * 50).toFixed(1)}%   쿼터 ${(f * 25).toFixed(1)}%`);
        out.push(`  → 풀 켈리 리스크 ${fmtUsd(f * seed)} / 하프 ${fmtUsd(f * 0.5 * seed)} (시드 ${fmtUsd(seed)} 기준)`);
        out.push(`  ※ 검증된 깨끗한 R배수 표본 전엔 풀 켈리 비권장. 감(感) p는 구조적으로 부풀려짐.`);
      }
    }
  } else if (tps.length) {
    out.push(`\n(켈리 계산하려면 --p <승률> 추가. 단, 감이 아닌 실측 승률 권장.)`);
  }
  console.log(out.join('\n'));
}

// ── 저널 (트레이드 로그) ────────────────────────────────────
function loadJournal() {
  if (!existsSync(JOURNAL)) return [];
  return readFileSync(JOURNAL, 'utf8')
    .split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// log — 트레이드 한 건 기록 (append-only)
function cmdLog(flags) {
  const symbol = normSymbol(flags._pos || flags.symbol);
  if (!symbol) { console.error('사용법: node trading/hax.mjs log <SYMBOL> --entry .. --sl .. --risk .. [--exit .. | --pnl .. | --r ..] [--side long|short] [--note ".."]'); process.exit(1); }
  const side = (flags.side === 'short') ? 'short' : 'long';
  const entry = num(flags.entry), sl = num(flags.sl), risk = num(flags.risk);
  const dir = side === 'long' ? 1 : -1;

  let qty = num(flags.qty);
  if (!Number.isFinite(qty) && Number.isFinite(entry) && Number.isFinite(sl) && Number.isFinite(risk))
    qty = risk / Math.abs(entry - sl);

  const exit = num(flags.exit);
  let pnl = num(flags.pnl);
  if (!Number.isFinite(pnl) && Number.isFinite(exit) && Number.isFinite(qty) && Number.isFinite(entry))
    pnl = (exit - entry) * qty * dir;

  let r = num(flags.r);
  if (!Number.isFinite(r) && Number.isFinite(pnl) && Number.isFinite(risk) && risk !== 0)
    r = pnl / risk;

  const closed = Number.isFinite(pnl) || Number.isFinite(exit) || Number.isFinite(r);
  const rec = {
    ts: Date.now(),
    date: flags.date || new Date().toISOString().slice(0, 10),
    symbol, side,
    entry: Number.isFinite(entry) ? entry : null,
    sl: Number.isFinite(sl) ? sl : null,
    risk: Number.isFinite(risk) ? risk : null,
    qty: Number.isFinite(qty) ? +qty.toFixed(6) : null,
    exit: Number.isFinite(exit) ? exit : null,
    pnl: Number.isFinite(pnl) ? +pnl.toFixed(2) : null,
    r: Number.isFinite(r) ? +r.toFixed(3) : null,
    status: closed ? 'closed' : 'open',
    note: typeof flags.note === 'string' ? flags.note : '',
  };
  appendFileSync(JOURNAL, JSON.stringify(rec) + '\n');

  console.log(`✓ 기록됨 → trading/journal.jsonl`);
  console.log(`  ${rec.date}  ${symbol} ${side}  진입 ${rec.entry ?? '—'}  손절 ${rec.sl ?? '—'}  1R ${rec.risk != null ? fmtUsd(rec.risk) : '—'}`);
  console.log(`  상태 ${rec.status}` + (rec.pnl != null ? `  손익 ${fmtUsd(rec.pnl)}  ${rec.r >= 0 ? '+' : ''}${rec.r}R` : '') + (rec.note ? `  「${rec.note}」` : ''));
  console.log(`  ※ 컨테이너는 휘발성 — 보존하려면 커밋: git add trading/journal.jsonl && git commit`);
}

// list — 최근 기록
function cmdList(flags) {
  const all = loadJournal();
  if (!all.length) { console.log('기록 없음. log 커맨드로 추가하세요.'); return; }
  const n = parseInt(flags.n) || 20;
  const rows = all.slice(-n);
  console.log(`━━━ 트레이드 로그 (최근 ${rows.length}/${all.length}건) ━━━`);
  console.log(`날짜        심볼         방향   1R       손익        R      상태`);
  for (const t of rows) {
    console.log(
      `${(t.date || '').padEnd(11)} ${(t.symbol || '').padEnd(11)} ${(t.side || '').padEnd(5)} ` +
      `${(t.risk != null ? fmtUsd(t.risk) : '—').padEnd(8)} ` +
      `${(t.pnl != null ? fmtUsd(t.pnl) : '—').padEnd(11)} ` +
      `${(t.r != null ? (t.r >= 0 ? '+' : '') + t.r : '—').toString().padEnd(6)} ${t.status}` +
      (t.note ? `  「${t.note}」` : '')
    );
  }
}

// stats — 닫힌 트레이드의 실측 통계 + 실측 켈리
function cmdStats() {
  const closed = loadJournal().filter(t => t.status === 'closed' && Number.isFinite(t.r));
  if (closed.length < 1) { console.log('닫힌 트레이드(R배수 보유)가 없음. 표본을 쌓으세요.'); return; }
  const Rs = closed.map(t => t.r);
  const n = Rs.length;
  const wins = Rs.filter(r => r > 0), losses = Rs.filter(r => r <= 0);
  const p = wins.length / n;
  const avgWin = wins.length ? wins.reduce((s, x) => s + x, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, x) => s + x, 0) / losses.length : 0;
  const expectancy = Rs.reduce((s, x) => s + x, 0) / n;
  const grossWin = wins.reduce((s, x) => s + x, 0);
  const grossLoss = Math.abs(losses.reduce((s, x) => s + x, 0));
  const pf = grossLoss ? grossWin / grossLoss : Infinity;

  const out = [];
  out.push(`━━━ 실측 통계 (닫힌 ${n}건) ━━━`);
  out.push(`승률 p = ${(p * 100).toFixed(1)}%  (${wins.length}승 ${losses.length}패)`);
  out.push(`평균 수익 +${avgWin.toFixed(2)}R   평균 손실 ${avgLoss.toFixed(2)}R`);
  out.push(`기댓값(expectancy) ${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(3)}R / 트레이드`);
  out.push(`Profit Factor ${pf === Infinity ? '∞' : pf.toFixed(2)}`);

  if (expectancy <= 0) {
    out.push(`\n⛔ 기댓값 ≤ 0. 전략 자체가 음(-)의 기댓값 — 사이징으로 해결 불가.`);
    out.push(`   켈리 이전에 진입/청산 규칙부터 점검할 것.`);
  } else {
    // 이항 근사 켈리 (평균 수익 R을 손익비로)
    const Rbin = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : avgWin;
    const fBin = p - (1 - p) / Rbin;
    // 실측 켈리: mean(ln(1+f·Ri)) 최대화 (수치 탐색)
    let bestF = 0, bestG = -Infinity;
    for (let f = 0; f < 0.99; f += 0.001) {
      let g = 0, ok = true;
      for (const r of Rs) { const x = 1 + f * r; if (x <= 0) { ok = false; break; } g += Math.log(x); }
      if (!ok) break;
      g /= n;
      if (g > bestG) { bestG = g; bestF = f; }
    }
    out.push(`\n━━━ 켈리 (실측 R배수 기반) ━━━`);
    out.push(`이항 근사 (R=${Rbin.toFixed(2)}):  f* = ${(fBin * 100).toFixed(1)}%`);
    out.push(`실측 켈리 (성장률 최대화):  f* = ${(bestF * 100).toFixed(1)}%`);
    out.push(`권장: 하프 ${(bestF * 50).toFixed(1)}%  /  쿼터 ${(bestF * 25).toFixed(1)}%`);
    if (n < 30) out.push(`⚠ 표본 ${n}건은 작음 — 30~50건 이상 쌓일 때까지 풀 켈리 금지, 쿼터 이하 권장.`);
  }
  // 데이터 위생 경고
  const dirty = Rs.filter(r => r < -1.05);
  if (dirty.length) out.push(`\n⚠ -1R보다 큰 손실 ${dirty.length}건 (예: ${dirty.map(r => r.toFixed(1) + 'R').slice(0, 3).join(', ')}). 물타기/손절미준수 의심 — 켈리 무효화.`);
  console.log(out.join('\n'));
}

// checklist — 진입 전 게이트
function cmdChecklist(flags) {
  const entry = num(flags.entry), sl = num(flags.sl), risk = num(flags.risk), seed = num(flags.seed) || 5000;
  const tp1 = num(flags.tp1), lev = num(flags.lev);
  const side = (flags.side === 'short') ? 'short' : 'long';
  const items = [];
  const check = (label, pass, detail) => items.push({ label, pass, detail });

  check('손절가(SL)를 진입 전에 정했는가', Number.isFinite(sl),
    Number.isFinite(sl) ? `SL ${fmtPrice(sl)}` : '--sl 누락 → SL 없는 진입 금지');
  if (Number.isFinite(sl) && Number.isFinite(entry)) {
    const slOk = side === 'long' ? sl < entry : sl > entry;
    check('SL 방향이 올바른가', slOk, slOk ? 'OK' : `${side}인데 SL이 진입가 반대편`);
  }
  if (Number.isFinite(risk)) {
    const pctSeed = risk / seed * 100;
    check('리스크가 시드의 1~2% 이내인가', pctSeed <= 2, `1R ${fmtUsd(risk)} = 시드의 ${pctSeed.toFixed(1)}%`);
  } else check('리스크(1R)를 고정했는가', false, '--risk 누락');
  if (Number.isFinite(entry) && Number.isFinite(sl) && Number.isFinite(tp1)) {
    const r1 = (side === 'long' ? tp1 - entry : entry - tp1) / Math.abs(entry - sl);
    check('TP1 손익비가 +1R 이상인가', r1 >= 1, `TP1 = ${r1 >= 0 ? '+' : ''}${r1.toFixed(2)}R`);
  }
  if (Number.isFinite(lev) && Number.isFinite(entry) && Number.isFinite(sl)) {
    const liq = liqPrice(entry, lev, side);
    const liqBeforeSL = side === 'long' ? liq >= sl : liq <= sl;
    check('청산가가 SL보다 멀리 있는가', !liqBeforeSL, `${lev}x 청산 ${fmtPrice(liq)} (추정)`);
  }
  // 규율 서약 (자동 판단 불가 → 항상 상기)
  const manual = [
    '물타기 안 한다 — SL 닿으면 추가 진입 없이 청산',
    '진입과 동시에 SL 주문을 등록한다',
    '레버리지를 올려 증거금 부족을 메우지 않는다 (수량을 줄인다)',
    '"본절까지만 버틴다"는 매몰비용 — 지금 신규 진입할 자리인지로만 판단',
  ];

  const out = [];
  out.push(`━━━ 진입 전 체크리스트 ━━━`);
  let allPass = true;
  for (const it of items) {
    if (!it.pass) allPass = false;
    out.push(`  ${it.pass ? '✅' : '❌'} ${it.label}  —  ${it.detail}`);
  }
  out.push(`\n  [수동 확인 — 규율]`);
  for (const m of manual) out.push(`  ☐ ${m}`);
  out.push(`\n  판정: ${allPass ? '✅ 자동 항목 통과 (위 수동 항목 확인 후 진입)' : '⛔ 미통과 항목 있음 — 진입 보류'}`);
  console.log(out.join('\n'));
}

// ── 엔트리 ──────────────────────────────────────────────────
async function main() {
  const [, , cmd, ...rest] = process.argv;
  const flags = parseFlags(rest);
  try {
    if (cmd === 'market') await cmdMarket(flags);
    else if (cmd === 'size') cmdSize(flags);
    else if (cmd === 'log') cmdLog(flags);
    else if (cmd === 'list') cmdList(flags);
    else if (cmd === 'stats') cmdStats(flags);
    else if (cmd === 'checklist' || cmd === 'check') cmdChecklist(flags);
    else {
      console.log(`HaxKai 트레이딩 어시스턴트 CLI

  market <SYMBOL> [--tf 4h,1d] [--limit 200]
      라이브 현재가·펀딩비·캔들·지지/저항·ATR·스파크라인

  size --entry <가격> --sl <가격> --risk <$> [--tp1 .. --p 0.55 --side long|short --seed 5000]
      포지션 수량·명목·레버리지표·청산가·R배수·켈리 f*

  checklist --entry .. --sl .. --risk .. [--tp1 .. --lev .. --seed 5000]
      진입 전 게이트 (SL·리스크·손익비·청산·물타기 규율)

  log <SYMBOL> --entry .. --sl .. --risk .. [--exit .. | --pnl .. | --r ..] [--side --note]
      트레이드 한 건을 journal.jsonl 에 기록

  list [--n 20]      최근 트레이드 로그
  stats              닫힌 표본의 승률·기댓값·Profit Factor·실측 켈리

예) node trading/hax.mjs market TA
    node trading/hax.mjs checklist --entry 0.0245 --sl 0.021481 --risk 250 --tp1 0.027001 --lev 3
    node trading/hax.mjs log HUMA --entry 0.0245 --sl 0.021481 --risk 250 --exit 0.0300 --note "HaxKai 지지 리테스트"
    node trading/hax.mjs stats`);
    }
  } catch (e) {
    console.error('오류: ' + e.message);
    process.exit(1);
  }
}
main();
