'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Trade {
  id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  quantity: number;
  target_price: number;
  stop_price: number;
  status: string;
  pnl_usdt: number | null;
  reasoning: string;
  approved_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export default function TradeHistoryPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/trading/trades')
      .then((r) => r.json())
      .then((d) => setTrades(d.trades ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">로딩 중...</div>;

  const totalPnl = trades.reduce((s, t) => s + (t.pnl_usdt ?? 0), 0);
  const wins = trades.filter((t) => (t.pnl_usdt ?? 0) > 0).length;
  const closed = trades.filter((t) => t.status !== 'open').length;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trading" className="text-gray-400 hover:text-white">← 대시보드</Link>
        <h1 className="text-xl font-bold">📊 매매 내역</h1>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">총 P&L</div>
          <div className={`text-xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">승률</div>
          <div className="text-xl font-bold">
            {closed > 0 ? Math.round((wins / closed) * 100) : 0}%
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">총 매매</div>
          <div className="text-xl font-bold">{trades.length}</div>
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-8 text-center text-gray-500">
          <div className="text-3xl mb-3">📭</div>
          <p>매매 내역 없음</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((trade) => {
            const pnl = trade.pnl_usdt ?? null;
            const isOpen = trade.status === 'open';

            return (
              <div key={trade.id} className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{trade.symbol}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${trade.side === 'LONG' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {trade.side}
                    </span>
                  </div>
                  <div className="text-right">
                    {isOpen ? (
                      <span className="text-yellow-400 text-sm font-semibold">진행 중</span>
                    ) : pnl !== null ? (
                      <span className={`font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
                  <div><span className="text-gray-400">진입 </span>${trade.entry_price.toFixed(4)}</div>
                  <div><span className="text-green-400">목표 </span>${trade.target_price.toFixed(4)}</div>
                  <div><span className="text-red-400">손절 </span>${trade.stop_price.toFixed(4)}</div>
                </div>

                <p className="text-xs text-gray-500 mb-1 leading-relaxed">{trade.reasoning.slice(0, 150)}...</p>

                <div className="text-xs text-gray-600">
                  {trade.approved_at ? new Date(trade.approved_at).toLocaleString('ko-KR') : ''}
                  {trade.closed_at ? ` → ${new Date(trade.closed_at).toLocaleString('ko-KR')}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
