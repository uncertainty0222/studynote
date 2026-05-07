'use client';

import { useState, useEffect, useCallback } from 'react';

interface BinanceHolding { asset: string; total: number; usdtValue: number; }
interface BinanceSection { key: string; label: string; usdt: number; holdings: BinanceHolding[]; }
interface BinanceData {
  sections: BinanceSection[];
  totalUsdt: number;
  usdToVnd: number;
  usdToKrw: number;
  updatedAt: string;
}

function fmtUsd(v: number) {
  return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function fmtVnd(v: number) {
  return '₫' + new Intl.NumberFormat('vi-VN').format(Math.round(v));
}
function fmtKrw(v: number) {
  return '₩' + new Intl.NumberFormat('ko-KR').format(Math.round(v));
}

const SECTION_COLORS: Record<string, { bar: string; dot: string }> = {
  spot:    { bar: 'bg-amber-400',  dot: 'bg-amber-400' },
  futures: { bar: 'bg-blue-400',   dot: 'bg-blue-400' },
  funding: { bar: 'bg-emerald-400', dot: 'bg-emerald-400' },
};

export default function PersonalTab({ user, lang }: { user: { role: string }; lang: 'ko' | 'vi' }) {
  const [binance, setBinance] = useState<BinanceData | null>(null);
  const [binanceErr, setBinanceErr] = useState('');
  const [binanceLoading, setBinanceLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const fetchBinance = useCallback(async () => {
    setBinanceLoading(true);
    setBinanceErr('');
    const res = await fetch('/api/personal/binance');
    if (res.ok) { setBinance(await res.json()); }
    else { const d = await res.json(); setBinanceErr(d.error ?? '오류'); }
    setBinanceLoading(false);
  }, []);

  useEffect(() => {
    if (!binance && !binanceLoading && !binanceErr) fetchBinance();
  }, [binance, binanceLoading, binanceErr, fetchBinance]);

  // vault placeholder (0 until Google Sheets connected)
  const vaultUsd = 0;

  const totalUsd = vaultUsd + (binance?.totalUsdt ?? 0);
  const usdToVnd = binance?.usdToVnd ?? 25800;
  const usdToKrw = binance?.usdToKrw ?? 1380;

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
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">금고 <span className="text-gray-400 font-normal text-xs">Kho tiền</span></p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">{fmtUsd(vaultUsd)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">
              {totalUsd > 0 ? ((vaultUsd / totalUsd) * 100).toFixed(1) : '0.0'}%
            </p>
            <p className="text-xs text-amber-500 mt-1">연결 준비 중</p>
          </div>
        </div>
        <div className="mx-4 mb-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gray-300 rounded-full" style={{ width: `${totalUsd > 0 ? (vaultUsd / totalUsd) * 100 : 0}%` }} />
        </div>
      </div>

      {/* ── 바이낸스 (Binance) ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">바이낸스 <span className="text-gray-400 font-normal text-xs">Binance</span></p>
            {binance && <p className="text-lg font-bold text-gray-800 mt-0.5">{fmtUsd(binance.totalUsdt)}</p>}
          </div>
          <div className="flex items-center gap-2">
            {binance && totalUsd > 0 && (
              <p className="text-xs text-gray-400">{((binance.totalUsdt / totalUsd) * 100).toFixed(1)}%</p>
            )}
            <button onClick={fetchBinance} disabled={binanceLoading}
              className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 font-medium px-2.5 py-1.5 rounded-lg transition-colors">
              {binanceLoading ? '...' : '🔄'}
            </button>
          </div>
        </div>

        {binance && (
          <div className="mx-4 mb-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${totalUsd > 0 ? (binance.totalUsdt / totalUsd) * 100 : 100}%` }} />
          </div>
        )}

        {binanceErr && (
          <div className="mx-4 mb-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">⚠️ {binanceErr}</div>
        )}

        {binanceLoading && !binance && (
          <p className="text-xs text-gray-400 text-center pb-4">조회 중...</p>
        )}

        {/* 섹션별 상세 */}
        {binance && (
          <div className="border-t border-gray-50 divide-y divide-gray-50">
            {binance.sections.map(section => {
              const pct = binance.totalUsdt > 0 ? (section.usdt / binance.totalUsdt * 100) : 0;
              const isExpanded = expandedSection === section.key;
              const colors = SECTION_COLORS[section.key] ?? { bar: 'bg-gray-300', dot: 'bg-gray-300' };
              const sectionLabels: Record<string, string> = { spot: 'SPOT', futures: 'FUTURES', funding: 'FUNDING' };
              return (
                <div key={section.key}>
                  <button
                    onClick={() => section.holdings.length > 0 && setExpandedSection(isExpanded ? null : section.key)}
                    className={`w-full px-4 py-2.5 flex items-center justify-between ${section.holdings.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                      <span className="text-xs font-semibold text-gray-700">{sectionLabels[section.key]}</span>
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
