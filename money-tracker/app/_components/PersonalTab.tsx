'use client';

import { useState, useEffect, useCallback } from 'react';

interface BinanceHolding { asset: string; total: number; usdtValue: number; }
interface BinanceSection { key: string; label: string; usdt: number; holdings: BinanceHolding[]; }
interface BinanceData { sections: BinanceSection[]; totalUsdt: number; usdToVnd: number; usdToKrw: number; updatedAt: string; }

interface VaultData { usd: Record<string, number>; krw: Record<string, number>; vnd: Record<string, number>; }
interface VaultResponse {
  vault: VaultData; usdToKrw: number; usdToVnd: number;
  usdCash: number; krwCash: number; vndCash: number;
  totalUsd: number; totalKrw: number; totalVnd: number;
}

const USD_DENOMS = ['100', '50', '20', '10', '5', '2', '1'];
const KRW_DENOMS = ['50000', '10000', '5000', '1000'];
const VND_DENOMS = ['500000', '200000', '100000'];

function fmtUsd(v: number) { return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v); }
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

  useEffect(() => { if (!binance && !binanceLoading && !binanceErr) fetchBinance(); }, [binance, binanceLoading, binanceErr, fetchBinance]);
  useEffect(() => { fetchVault(); }, [fetchVault]);

  async function saveVault() {
    if (!vaultDraft) return;
    setVaultSaving(true);
    await fetch('/api/personal/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vaultDraft) });
    await fetchVault();
    setVaultSaving(false);
    setVaultOpen(false);
  }

  function setCount(currency: 'usd' | 'krw' | 'vnd', denom: string, val: string) {
    setVaultDraft(prev => prev ? { ...prev, [currency]: { ...prev[currency], [denom]: Math.max(0, parseInt(val) || 0) } } : prev);
  }

  // Calculate totals for display
  const usdToKrw = vaultResp?.usdToKrw ?? binance?.usdToKrw ?? 1380;
  const usdToVnd = vaultResp?.usdToVnd ?? binance?.usdToVnd ?? 25800;
  const vaultTotals = vaultDraft && vaultOpen ? calcVaultTotals(vaultDraft, usdToKrw, usdToVnd) : null;
  const savedTotals = vaultResp;

  const vaultUsd = savedTotals?.totalUsd ?? 0;
  const binanceUsd = binance?.totalUsdt ?? 0;
  const totalUsd = vaultUsd + binanceUsd;

  const displayTotals = vaultOpen && vaultTotals ? vaultTotals : savedTotals;

  return (
    <div className="space-y-3">
      {/* ── 총 자산 카드 ── */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 text-white shadow-lg">
        <p className="text-xs font-medium opacity-70 mb-2 uppercase tracking-wide">총 자산 · Tổng tài sản</p>
        <p className="text-4xl font-bold tracking-tight">{fmtUsd(totalUsd)}</p>
        <div className="flex gap-4 mt-2">
          <p className="text-sm opacity-80">{fmtVnd(totalUsd * usdToVnd)}</p>
          <p className="text-sm opacity-80">{fmtKrw(totalUsd * usdToKrw)}</p>
        </div>
        {binance && (
          <p className="text-xs opacity-40 mt-3">
            $1 = ₫{usdToVnd.toLocaleString()} / ₩{usdToKrw.toLocaleString()} · {new Date(binance.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* ── 금고 (Kho tiền) ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {/* 헤더 */}
        <button onClick={() => setVaultOpen(v => !v)} className="w-full px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 text-left">금고 <span className="text-gray-400 font-normal text-xs">Kho tiền</span></p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">{fmtUsd(vaultUsd)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">{totalUsd > 0 ? ((vaultUsd / totalUsd) * 100).toFixed(1) : '0.0'}%</p>
            <p className="text-xs text-indigo-500 mt-1">{vaultOpen ? '접기 ▲' : '수정 ▼'}</p>
          </div>
        </button>

        {/* 비중 바 */}
        <div className="mx-4 mb-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-300 rounded-full transition-all" style={{ width: `${totalUsd > 0 ? (vaultUsd / totalUsd) * 100 : 0}%` }} />
        </div>

        {/* 입력 패널 */}
        {vaultOpen && vaultDraft && (
          <div className="border-t border-gray-100 px-4 py-3 space-y-3">
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
                    <div key={d} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-10 text-right">${d}</span>
                      <input type="number" min="0" value={cnt}
                        onChange={e => setCount('usd', d, e.target.value)}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-center text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      <span className="text-xs text-gray-400 flex-1 text-right">{amt > 0 ? fmtUsd(amt) : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 사무실정산 (추가 달러 금액) */}
            <div className="border-t border-gray-50 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20">사무실정산</span>
                <input type="number" min="0" value={vaultDraft.usd['office'] ?? 0}
                  onChange={e => setCount('usd', 'office', e.target.value)}
                  className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-center text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
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
                    <div key={d} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-16 text-right">₩{Number(d).toLocaleString()}</span>
                      <input type="number" min="0" value={cnt}
                        onChange={e => setCount('krw', d, e.target.value)}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-center text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
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
                    <div key={d} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-18 text-right">₫{Number(d).toLocaleString()}</span>
                      <input type="number" min="0" value={cnt}
                        onChange={e => setCount('vnd', d, e.target.value)}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-center text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
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

            {/* 저장 버튼 */}
            <button onClick={saveVault} disabled={vaultSaving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
              {vaultSaving ? '저장 중...' : '💾 저장'}
            </button>
          </div>
        )}
      </div>

      {/* ── 바이낸스 (Binance) ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">바이낸스 <span className="text-gray-400 font-normal text-xs">Binance</span></p>
            {binance && <p className="text-lg font-bold text-gray-800 mt-0.5">{fmtUsd(binanceUsd)}</p>}
          </div>
          <div className="flex items-center gap-2">
            {binance && totalUsd > 0 && <p className="text-xs text-gray-400">{((binanceUsd / totalUsd) * 100).toFixed(1)}%</p>}
            <button onClick={fetchBinance} disabled={binanceLoading}
              className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 font-medium px-2.5 py-1.5 rounded-lg transition-colors">
              {binanceLoading ? '...' : '🔄'}
            </button>
          </div>
        </div>

        {binance && (
          <div className="mx-4 mb-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${totalUsd > 0 ? (binanceUsd / totalUsd) * 100 : 100}%` }} />
          </div>
        )}
        {binanceErr && <div className="mx-4 mb-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">⚠️ {binanceErr}</div>}
        {binanceLoading && !binance && <p className="text-xs text-gray-400 text-center pb-4">조회 중...</p>}

        {binance && (
          <div className="border-t border-gray-50 divide-y divide-gray-50">
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
    </div>
  );
}
