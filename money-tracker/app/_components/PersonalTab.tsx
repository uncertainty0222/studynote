'use client';

import { useState, useEffect, useCallback } from 'react';

interface BinanceHolding { asset: string; total: number; usdtValue: number; }
interface BinanceSection { key: string; label: string; usdt: number; holdings: BinanceHolding[]; }
interface BinanceData { sections: BinanceSection[]; totalUsdt: number; usdToVnd: number; usdToKrw: number; updatedAt: string; sectionErrors?: Record<string, string>; }

interface VaultData { usd: Record<string, number>; krw: Record<string, number>; vnd: Record<string, number>; }
interface VaultResponse {
  vault: VaultData; usdToKrw: number; usdToVnd: number;
  usdCash: number; krwCash: number; vndCash: number;
  totalUsd: number; totalKrw: number; totalVnd: number;
}

interface AssetSnapshot { id: number; total_usd: number; vault_usd: number; binance_usd: number; usd_to_vnd: number; snapshot_at: string; }
interface Candle { weekKey: string; label: string; open: number; close: number; high: number; low: number; }
interface IncomeEntry { id: number; amount: number; currency: string; category: string; description: string; date: string; created_at: string; }

const INCOME_CATEGORY_LABEL: Record<string, string> = { 'TOUR': '🗺️ TOUR', 'COIN': '🪙 COIN', '기타': '📦 기타', '투어': '🗺️ TOUR', '투자수익': '🪙 COIN' };
function fmtIncomeAmt(amount: number, currency: string, usdToVnd: number, usdToKrw: number): string {
  if (currency === 'VND') return `₫${Math.round(amount / 1000).toLocaleString()}k`;
  if (currency === 'KRW') return `₩${Math.round(amount).toLocaleString()}`;
  const usdAmt = currency === 'USD' ? amount : currency === 'KRW' ? amount / usdToKrw : amount / usdToVnd;
  return `$${usdAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
function toVndAmt(amount: number, currency: string, usdToVnd: number, usdToKrw: number): string {
  let vnd: number;
  if (currency === 'VND') vnd = amount;
  else if (currency === 'KRW') vnd = (amount / usdToKrw) * usdToVnd;
  else vnd = amount * usdToVnd; // USD
  return `₫${Math.round(vnd / 1000).toLocaleString()}k`;
}

function getWeekKey(date: Date): string {
  const d = new Date(date.getTime());
  d.setUTCHours(0, 0, 0, 0);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // move to Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.floor((d.getTime() - yearStart.getTime()) / (7 * 86400000)) + 1;
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

function weekLabel(weekKey: string): string {
  const [yearStr, weekStr] = weekKey.split('-');
  const year = Number(yearStr), week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Mon = new Date(jan4);
  jan4Mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const monday = new Date(jan4Mon.getTime() + (week - 1) * 7 * 86400000);
  return `${monday.getUTCMonth() + 1}/${monday.getUTCDate()}`;
}

function buildCandles(snapshots: AssetSnapshot[]): Candle[] {
  if (!snapshots.length) return [];
  const byWeek: Record<string, number[]> = {};
  for (const s of snapshots) {
    const wk = getWeekKey(new Date(s.snapshot_at));
    if (!byWeek[wk]) byWeek[wk] = [];
    byWeek[wk].push(Number(s.total_usd));
  }
  return Object.keys(byWeek).sort().map(wk => {
    const vals = byWeek[wk];
    return { weekKey: wk, label: weekLabel(wk), open: vals[0], close: vals[vals.length - 1], high: Math.max(...vals), low: Math.min(...vals) };
  });
}

function CandlestickChart({ candles }: { candles: Candle[] }) {
  const visible = candles.slice(-16);
  if (!visible.length) {
    return (
      <div className="py-8 text-center text-gray-400 text-xs">
        <p className="text-2xl mb-1">📊</p>
        <p>금고를 저장하면 차트가 쌓여요</p>
        <p className="text-[10px] mt-0.5 text-gray-300">Lưu kho tiền để xây biểu đồ</p>
      </div>
    );
  }

  const W = 320, H = 180, PT = 10, PB = 28, PL = 50, PR = 6;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const n = visible.length;
  const spacing = innerW / n;
  const bw = Math.min(spacing * 0.65, 14);

  const allVals = visible.flatMap(c => [c.high, c.low]);
  const rawMin = Math.min(...allVals), rawMax = Math.max(...allVals);
  const center = (rawMin + rawMax) / 2;
  const rawRange = rawMax - rawMin;
  const minPad = Math.abs(center) * 0.05;
  const pad = Math.max(rawRange * 0.2, minPad, 1);
  const vMin = rawMin - pad, vMax = rawMax + pad;
  const vRange = vMax - vMin;

  const toY = (v: number) => PT + ((vMax - v) / vRange) * innerH;
  const toX = (i: number) => PL + (i + 0.5) * spacing;
  const fmtK = (v: number) => {
    if (v >= 1000) {
      const k = v / 1000;
      if (vRange < 5000) return `$${k.toFixed(2)}k`;
      if (vRange < 50000) return `$${k.toFixed(1)}k`;
      return `$${k.toFixed(0)}k`;
    }
    return `$${Math.round(v)}`;
  };
  const yTicks = [0.2, 0.4, 0.6, 0.8].map(f => vMin + vRange * f);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={toY(t)} y2={toY(t)} stroke="#e2e8f0" strokeWidth={0.8} />
          <text x={PL - 3} y={toY(t) + 3} textAnchor="end" fontSize={8} fill="#94a3b8">{fmtK(t)}</text>
        </g>
      ))}
      {visible.map((c, i) => {
        const x = toX(i);
        const bullish = c.close >= c.open;
        const col = bullish ? '#10b981' : '#f43f5e';
        const bodyT = toY(Math.max(c.open, c.close));
        const bodyB = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(2, bodyB - bodyT);
        return (
          <g key={c.weekKey}>
            <line x1={x} x2={x} y1={toY(c.high)} y2={toY(c.low)} stroke={col} strokeWidth={1} strokeLinecap="round" />
            <rect x={x - bw / 2} y={bodyT} width={bw} height={bodyH} fill={col} rx={1.5} />
          </g>
        );
      })}
      {visible.map((c, i) => {
        if (n > 8 && i % 2 !== 0) return null;
        return (
          <text key={c.weekKey} x={toX(i)} y={H - 6} textAnchor="middle" fontSize={7.5} fill="#94a3b8">{c.label}</text>
        );
      })}
    </svg>
  );
}

const USD_DENOMS = ['100', '50', '20', '10', '5', '2', '1'];
const KRW_DENOMS = ['50000', '10000', '5000', '1000'];
const VND_DENOMS = ['500000', '200000', '100000'];

function fmtUsd(v: number) { return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(v)); }
function fmtVnd(v: number) { return '₫' + new Intl.NumberFormat('vi-VN').format(Math.round(v)); }
function fmtKrw(v: number) { return '₩' + new Intl.NumberFormat('ko-KR').format(Math.round(v)); }

const SECTION_COLORS: Record<string, { bar: string; dot: string }> = {
  spot: { bar: 'bg-amber-400', dot: 'bg-amber-400' },
  futures: { bar: 'bg-blue-400', dot: 'bg-blue-400' },
  funding: { bar: 'bg-emerald-400', dot: 'bg-emerald-400' },
};

function calcVaultTotals(vault: VaultData, usdToKrw: number, usdToVnd: number) {
  const usdCash = USD_DENOMS.reduce((s, d) => s + Number(d) * (vault.usd[d] ?? 0), 0);
  const krwCash = KRW_DENOMS.reduce((s, d) => s + Number(d) * (vault.krw[d] ?? 0), 0);
  const vndCash = VND_DENOMS.reduce((s, d) => s + Number(d) * (vault.vnd[d] ?? 0), 0);
  const totalUsd = usdCash + krwCash / usdToKrw + vndCash / usdToVnd;
  const totalKrw = usdCash * usdToKrw + krwCash + vndCash / usdToVnd * usdToKrw;
  const totalVnd = usdCash * usdToVnd + krwCash / usdToKrw * usdToVnd + vndCash;
  return { usdCash, krwCash, vndCash, totalUsd, totalKrw, totalVnd };
}

export default function PersonalTab({ user, lang }: { user: { role: string }; lang: 'ko' | 'vi' }) {
  const [binance, setBinance] = useState<BinanceData | null>(null);
  const [binanceErr, setBinanceErr] = useState('');
  const [binanceLoading, setBinanceLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const [vaultResp, setVaultResp] = useState<VaultResponse | null>(null);
  const [vaultDraft, setVaultDraft] = useState<VaultData | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultSaving, setVaultSaving] = useState(false);

  const [husbandOwes, setHusbandOwes] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<AssetSnapshot[]>([]);
  const [recentIncomes, setRecentIncomes] = useState<IncomeEntry[]>([]);
  const [incomeExpanded, setIncomeExpanded] = useState(false);

  const fetchBinance = useCallback(async () => {
    setBinanceLoading(true); setBinanceErr('');
    const res = await fetch('/api/personal/binance');
    if (res.ok) setBinance(await res.json());
    else { const d = await res.json(); setBinanceErr(d.error ?? '오류'); }
    setBinanceLoading(false);
  }, []);

  const fetchVault = useCallback(async () => {
    const res = await fetch('/api/personal/vault');
    if (res.ok) { const d = await res.json() as VaultResponse; setVaultResp(d); setVaultDraft(d.vault); }
  }, []);

  const fetchBalance = useCallback(async () => {
    const res = await fetch('/api/balance');
    if (res.ok) { const d = await res.json(); setHusbandOwes(d.husbandOwes ?? 0); }
  }, []);

  const fetchSnapshots = useCallback(async () => {
    const res = await fetch('/api/personal/asset-snapshots');
    if (res.ok) setSnapshots(await res.json());
  }, []);

  const fetchRecentIncomes = useCallback(async () => {
    const res = await fetch('/api/personal/income');
    if (res.ok) { const d = await res.json(); setRecentIncomes((d.items ?? []).slice(0, 20)); }
  }, []);

  useEffect(() => { if (!binance && !binanceLoading && !binanceErr) fetchBinance(); }, [binance, binanceLoading, binanceErr, fetchBinance]);
  useEffect(() => { fetchVault(); }, [fetchVault]);
  useEffect(() => { fetchBalance(); }, [fetchBalance]);
  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);
  useEffect(() => { fetchRecentIncomes(); }, [fetchRecentIncomes]);

  async function saveVault() {
    if (!vaultDraft) return;
    setVaultSaving(true);
    await fetch('/api/personal/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vaultDraft) });
    const snapVaultUsd = calcVaultTotals(vaultDraft, usdToKrw, usdToVnd).totalUsd;
    const snapBinanceUsd = binance?.totalUsdt ?? 0;
    const snapBalance = husbandOwes !== null ? -(husbandOwes / usdToVnd) : 0;
    await fetch('/api/personal/asset-snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalUsd: snapVaultUsd + snapBinanceUsd + snapBalance, vaultUsd: snapVaultUsd, binanceUsd: snapBinanceUsd, usdToVnd }),
    });
    await Promise.all([fetchVault(), fetchSnapshots()]);
    setVaultSaving(false);
    setVaultOpen(false);
  }

  function setCount(currency: 'usd' | 'krw' | 'vnd', denom: string, val: string) {
    setVaultDraft(prev => prev ? { ...prev, [currency]: { ...prev[currency], [denom]: Math.max(0, parseInt(val) || 0) } } : prev);
  }

  function adjustCount(currency: 'usd' | 'krw' | 'vnd', denom: string, delta: number) {
    setVaultDraft(prev => {
      if (!prev) return prev;
      const cur = prev[currency][denom] ?? 0;
      return { ...prev, [currency]: { ...prev[currency], [denom]: Math.max(0, cur + delta) } };
    });
  }

  // Calculate totals for display
  const usdToKrw = vaultResp?.usdToKrw ?? binance?.usdToKrw ?? 1380;
  const usdToVnd = vaultResp?.usdToVnd ?? binance?.usdToVnd ?? 25800;
  const vaultTotals = vaultDraft && vaultOpen ? calcVaultTotals(vaultDraft, usdToKrw, usdToVnd) : null;
  const savedTotals = vaultResp;

  const vaultUsd = savedTotals?.totalUsd ?? 0;
  const binanceUsd = binance?.totalUsdt ?? 0;
  const balanceUsd = husbandOwes !== null ? -(husbandOwes / usdToVnd) : 0;
  const totalUsd = vaultUsd + binanceUsd + balanceUsd;

  const displayTotals = vaultOpen && vaultTotals ? vaultTotals : savedTotals;
  const candles = buildCandles(snapshots);

  const weekChange = candles.length >= 2
    ? candles[candles.length - 1].close - candles[candles.length - 2].close
    : null;

  return (
    <div className="space-y-3">
      {/* ── 총 자산 카드 ── */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-lg overflow-hidden text-white">
        {/* 헤더: 큰 숫자 */}
        <div className="px-5 pt-5 pb-4">
          <p className="text-[11px] font-medium opacity-50 uppercase tracking-widest mb-1">우리 재산 · Tổng tài sản</p>
          <p className="text-5xl font-black tracking-tight">{fmtUsd(totalUsd)}</p>
          <div className="flex gap-4 mt-2 opacity-80">
            <p className="text-sm">{fmtVnd(totalUsd * usdToVnd)}</p>
            <p className="text-sm">{fmtKrw(totalUsd * usdToKrw)}</p>
          </div>
          {weekChange !== null && (
            <p className={`text-sm font-semibold mt-2 ${weekChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {weekChange >= 0 ? '▲' : '▼'} {fmtUsd(Math.abs(weekChange))} 이번 주
            </p>
          )}
          {binance && (
            <p className="text-[10px] opacity-30 mt-2">
              $1 = ₫{Math.round(usdToVnd).toLocaleString()} / ₩{Math.round(usdToKrw).toLocaleString()} · {new Date(binance.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* 자산 구성 분포 */}
        {totalUsd > 0 && (
          <div className="bg-black/20 px-5 pt-3 pb-4 space-y-2.5">
            {/* 분포 바 */}
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden flex">
              <div className="h-full bg-indigo-300 rounded-l-full" style={{ width: `${(vaultUsd / totalUsd) * 100}%` }} />
              <div className="h-full bg-amber-300 rounded-r-full" style={{ width: `${(binanceUsd / totalUsd) * 100}%` }} />
            </div>
            <div className="flex gap-3 text-[10px] opacity-55">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-300 inline-block" />금고 · Kho</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-300 inline-block" />바이낸스</span>
            </div>
            {/* 3분할 타일 */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setVaultOpen(v => !v)}
                className="bg-white/10 active:bg-white/20 rounded-xl px-3 py-3 text-left transition-colors">
                <p className="text-[10px] opacity-60 mb-1">🏦 금고</p>
                <p className="text-sm font-bold">{fmtUsd(vaultUsd)}</p>
                <p className="text-[10px] opacity-50 mt-0.5">{((vaultUsd / totalUsd) * 100).toFixed(0)}% {vaultOpen ? '▲' : '▼'}</p>
              </button>
              <button onClick={fetchBinance} disabled={binanceLoading}
                className="bg-white/10 active:bg-white/20 rounded-xl px-3 py-3 text-left transition-colors">
                <p className="text-[10px] opacity-60 mb-1">📊 바이낸스</p>
                <p className="text-sm font-bold">{binanceLoading ? '...' : fmtUsd(binanceUsd)}</p>
                <p className="text-[10px] opacity-50 mt-0.5">{binance && totalUsd > 0 ? `${((binanceUsd / totalUsd) * 100).toFixed(0)}%` : '—'}</p>
              </button>
              <div className="bg-white/10 rounded-xl px-3 py-3">
                <p className="text-[10px] opacity-60 mb-1">💑 부부잔액</p>
                <p className={`text-sm font-bold ${husbandOwes !== null && husbandOwes > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {husbandOwes !== null ? (balanceUsd >= 0 ? '+' : '') + fmtUsd(balanceUsd) : '—'}
                </p>
                <p className="text-[10px] opacity-50 mt-0.5">
                  {husbandOwes === null || husbandOwes === 0 ? '정산됨 ✓' : husbandOwes > 0 ? '내가 줄 돈' : '받을 돈'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 금고 수정 패널 ── */}
      {vaultOpen && vaultDraft && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-indigo-700">🏦 금고 수정 · Kho tiền</p>
            <button onClick={() => setVaultOpen(false)} className="text-indigo-300 text-lg leading-none">✕</button>
          </div>
          <div className="px-4 py-3 space-y-3">
            {/* 달러 섹션 */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-xs font-semibold text-gray-600">달러 (USD)</p>
                <p className="text-xs font-bold text-gray-800">{fmtUsd(displayTotals?.usdCash ?? 0)}</p>
              </div>
              <div className="space-y-1">
                {USD_DENOMS.map(d => {
                  const cnt = vaultDraft.usd[d] ?? 0;
                  const amt = Number(d) * cnt;
                  return (
                    <div key={d} className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500 w-10 text-right">${d}</span>
                      <button onClick={() => adjustCount('usd', d, -1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center active:bg-gray-200">−</button>
                      <input type="number" min="0" value={cnt}
                        onChange={e => setCount('usd', d, e.target.value)}
                        className="w-12 border border-gray-200 rounded px-1 py-1 text-xs text-center text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      <button onClick={() => adjustCount('usd', d, 1)} className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center active:bg-indigo-200">+</button>
                      <span className="text-xs text-gray-400 flex-1 text-right">{amt > 0 ? fmtUsd(amt) : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* 사무실정산 */}
            <div className="border-t border-gray-50 pt-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 w-20">사무실정산</span>
                <button onClick={() => adjustCount('usd', 'office', -1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center active:bg-gray-200">−</button>
                <input type="number" min="0" value={vaultDraft.usd['office'] ?? 0}
                  onChange={e => setCount('usd', 'office', e.target.value)}
                  className="w-12 border border-gray-200 rounded px-1 py-1 text-xs text-center text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                <button onClick={() => adjustCount('usd', 'office', 1)} className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center active:bg-indigo-200">+</button>
                <span className="text-xs text-gray-400">달러</span>
              </div>
            </div>
            {/* 한국원 섹션 */}
            <div className="border-t border-gray-100 pt-2">
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-xs font-semibold text-gray-600">한국원 (KRW)</p>
                <p className="text-xs font-bold text-gray-800">{fmtKrw(displayTotals?.krwCash ?? 0)}</p>
              </div>
              <div className="space-y-1">
                {KRW_DENOMS.map(d => {
                  const cnt = vaultDraft.krw[d] ?? 0;
                  const amt = Number(d) * cnt;
                  return (
                    <div key={d} className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500 w-16 text-right">₩{Number(d).toLocaleString()}</span>
                      <button onClick={() => adjustCount('krw', d, -1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center active:bg-gray-200">−</button>
                      <input type="number" min="0" value={cnt}
                        onChange={e => setCount('krw', d, e.target.value)}
                        className="w-12 border border-gray-200 rounded px-1 py-1 text-xs text-center text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      <button onClick={() => adjustCount('krw', d, 1)} className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center active:bg-indigo-200">+</button>
                      <span className="text-xs text-gray-400 flex-1 text-right">{amt > 0 ? fmtKrw(amt) : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* 베트남 동 섹션 */}
            <div className="border-t border-gray-100 pt-2">
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-xs font-semibold text-gray-600">베트남 동 (VND)</p>
                <p className="text-xs font-bold text-gray-800">{fmtVnd(displayTotals?.vndCash ?? 0)}</p>
              </div>
              <div className="space-y-1">
                {VND_DENOMS.map(d => {
                  const cnt = vaultDraft.vnd[d] ?? 0;
                  const amt = Number(d) * cnt;
                  return (
                    <div key={d} className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500 w-18 text-right">₫{Number(d).toLocaleString()}</span>
                      <button onClick={() => adjustCount('vnd', d, -1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center active:bg-gray-200">−</button>
                      <input type="number" min="0" value={cnt}
                        onChange={e => setCount('vnd', d, e.target.value)}
                        className="w-12 border border-gray-200 rounded px-1 py-1 text-xs text-center text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      <button onClick={() => adjustCount('vnd', d, 1)} className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center active:bg-indigo-200">+</button>
                      <span className="text-xs text-gray-400 flex-1 text-right">{amt > 0 ? fmtVnd(amt) : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* 합산 요약 */}
            {displayTotals && (
              <div className="border-t border-gray-100 pt-3 grid grid-cols-3 gap-2">
                <div className="bg-red-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500 mb-0.5">달러가치 합산</p>
                  <p className="text-xs font-bold text-red-700">{fmtUsd(displayTotals.totalUsd)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500 mb-0.5">원화가치 합산</p>
                  <p className="text-xs font-bold text-red-700">{fmtKrw(displayTotals.totalKrw)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500 mb-0.5">동가치 합산</p>
                  <p className="text-xs font-bold text-red-700">{fmtVnd(displayTotals.totalVnd)}</p>
                </div>
              </div>
            )}
            <button onClick={saveVault} disabled={vaultSaving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
              {vaultSaving ? '저장 중...' : '💾 저장'}
            </button>
          </div>
        </div>
      )}

      {/* ── 바이낸스 상세 ── */}
      {(binanceErr || binance?.sectionErrors || binance) && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-amber-800">📊 바이낸스 · Binance</p>
              {binance && <p className="text-base font-bold text-gray-800">{fmtUsd(binanceUsd)}</p>}
            </div>
            <button onClick={fetchBinance} disabled={binanceLoading}
              className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 font-medium px-2.5 py-1.5 rounded-lg transition-colors">
              {binanceLoading ? '...' : '🔄'}
            </button>
          </div>
          {binanceErr && <div className="mx-4 my-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">⚠️ {binanceErr}</div>}
          {binance?.sectionErrors && Object.entries(binance.sectionErrors).map(([k, v]) => (
            <div key={k} className="mx-4 mb-1 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">⚠️ {k.toUpperCase()} 오류: {v}</div>
          ))}
          {binanceLoading && !binance && <p className="text-xs text-gray-400 text-center py-4">조회 중...</p>}
          {binance && (
            <div className="divide-y divide-gray-50">
              {binance.sections.map(section => {
                const pct = binanceUsd > 0 ? (section.usdt / binanceUsd * 100) : 0;
                const isExpanded = expandedSection === section.key;
                const colors = SECTION_COLORS[section.key] ?? { bar: 'bg-gray-300', dot: 'bg-gray-300' };
                return (
                  <div key={section.key}>
                    <button onClick={() => section.holdings.length > 0 && setExpandedSection(isExpanded ? null : section.key)}
                      className={`w-full px-4 py-2.5 flex items-center justify-between ${section.holdings.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                        <span className="text-xs font-semibold text-gray-700">{section.label}</span>
                        <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-700">{fmtUsd(section.usdt)}</span>
                        {section.holdings.length > 0 && <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>}
                      </div>
                    </button>
                    {isExpanded && (
                      <ul className="border-t border-gray-50 bg-gray-50/50">
                        {section.holdings.map(h => (
                          <li key={h.asset} className="px-4 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                                <span className="text-xs font-bold text-amber-700">{h.asset.slice(0, 2)}</span>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-800">{h.asset}</p>
                                <p className="text-xs text-gray-400">{h.total.toLocaleString('en-US', { maximumSignificantDigits: 5 })}</p>
                              </div>
                            </div>
                            <p className="text-xs font-semibold text-gray-700">{fmtUsd(h.usdtValue)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 최근 수익 카드 ── */}
      {recentIncomes.length > 0 && (() => {
        const latest = recentIncomes[0];
        const shown = incomeExpanded ? recentIncomes : [latest];
        const catLabel = INCOME_CATEGORY_LABEL[latest.category] ?? latest.category;
        return (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">최근 수익 · Thu nhập gần đây</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold text-emerald-600">
                    {fmtIncomeAmt(Number(latest.amount), latest.currency, usdToVnd, usdToKrw)}
                  </span>
                  {latest.currency !== 'VND' && (
                    <span className="text-xs text-emerald-400">{toVndAmt(Number(latest.amount), latest.currency, usdToVnd, usdToKrw)}</span>
                  )}
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{catLabel}</span>
                  {latest.description && <span className="text-xs text-gray-400 truncate max-w-[120px]">{latest.description}</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{latest.date}</p>
              </div>
              <div className="text-2xl animate-bounce">🎉</div>
            </div>
            {incomeExpanded && (
              <ul className="border-t border-gray-50 divide-y divide-gray-50">
                {shown.slice(1).map(item => (
                  <li key={item.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{INCOME_CATEGORY_LABEL[item.category] ?? item.category}</span>
                      <div>
                        <p className="text-xs font-medium text-gray-800">
                          {fmtIncomeAmt(Number(item.amount), item.currency, usdToVnd, usdToKrw)}
                          {item.currency !== 'VND' && <span className="text-gray-400 ml-1">{toVndAmt(Number(item.amount), item.currency, usdToVnd, usdToKrw)}</span>}
                        </p>
                        {item.description && <p className="text-xs text-gray-400">{item.description}</p>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">{item.date}</p>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => setIncomeExpanded(v => !v)}
              className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-50"
            >
              {incomeExpanded ? '▲ 접기' : `▼ 더보기 (${recentIncomes.length}건)`}
            </button>
          </div>
        );
      })()}

      {/* ── 자산 차트 ── */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-gray-800">자산 히스토리 <span className="text-gray-400 font-normal text-xs">Lịch sử tài sản</span></p>
            <p className="text-[10px] text-gray-400">주간 캔들차트 · Biểu đồ nến theo tuần</p>
          </div>
          {weekChange !== null && (
            <div className="text-right">
              <p className={`text-xs font-bold ${weekChange >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                {weekChange >= 0 ? '+' : ''}{fmtUsd(weekChange)}
              </p>
              <p className={`text-[10px] ${weekChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                주간 {weekChange >= 0 ? '▲' : '▼'} {Math.abs((weekChange / (candles[candles.length - 2]?.close || 1)) * 100).toFixed(1)}%
              </p>
            </div>
          )}
        </div>
        <CandlestickChart candles={candles} />
        {candles.length > 0 && (
          <div className="flex gap-3 mt-1 justify-end">
            <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />상승</span>
            <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-rose-500 inline-block" />하락</span>
          </div>
        )}
      </div>

    </div>
  );
}
