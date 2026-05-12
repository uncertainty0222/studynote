'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Setup {
  id: number;
  symbol: string;
  timeframe: string;
  detected_pattern: string | null;
  style_match_score: number | null;
  entry_price: number | null;
  target_price: number | null;
  stop_price: number | null;
  risk_reward: number | null;
  scan_reasoning: string;
  status: string;
  scanned_at: string;
}

export default function SetupsPage() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { loadSetups(); }, []);

  async function loadSetups() {
    setLoading(true);
    const res = await fetch('/api/trading/setups?status=all');
    if (res.ok) {
      const data = await res.json();
      setSetups(data.setups ?? []);
    }
    setLoading(false);
  }

  async function approve(id: number) {
    setActionId(id);
    setMsg('');
    const res = await fetch('/api/trading/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`✅ ${data.message}`);
    } else {
      setMsg(`❌ ${data.error}`);
    }
    setActionId(null);
    await loadSetups();
  }

  async function reject(id: number) {
    setActionId(id);
    setMsg('');
    await fetch('/api/trading/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setActionId(null);
    await loadSetups();
  }

  if (loading) return <div className="p-8 text-center text-gray-500">로딩 중...</div>;

  const pendingSetups = setups.filter((s) => s.status === 'pending' || s.status === 'alerted');

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trading" className="text-gray-400 hover:text-white">← 대시보드</Link>
        <h1 className="text-xl font-bold">⚡ 매매 셋업 승인</h1>
      </div>

      {msg && <div className="bg-gray-800 rounded-xl p-3 mb-4 text-sm">{msg}</div>}

      {pendingSetups.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-8 text-center text-gray-500">
          <div className="text-3xl mb-3">🔍</div>
          <p>대기 중인 셋업 없음</p>
          <p className="text-xs mt-1">시장 스캔 후 새 셋업이 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingSetups.map((setup) => {
            const score = setup.style_match_score ?? 0;
            const isLong = (setup.target_price ?? 0) > (setup.entry_price ?? 0);
            const scoreColor = score >= 0.80 ? 'text-green-400' : score >= 0.65 ? 'text-yellow-400' : 'text-gray-400';

            return (
              <div key={setup.id} className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">{setup.symbol}</span>
                    <span className="text-gray-400 text-sm">{setup.timeframe}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${isLong ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {isLong ? '롱' : '숏'}
                    </span>
                  </div>
                  <span className={`font-bold ${scoreColor}`}>{Math.round(score * 100)}% 일치</span>
                </div>

                {setup.detected_pattern && (
                  <div className="text-xs text-blue-400 mb-2">패턴: {setup.detected_pattern}</div>
                )}

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-gray-700 rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-400">진입</div>
                    <div className="text-sm font-bold">${setup.entry_price?.toFixed(4)}</div>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-2 text-center">
                    <div className="text-xs text-green-400">목표</div>
                    <div className="text-sm font-bold text-green-400">${setup.target_price?.toFixed(4)}</div>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-2 text-center">
                    <div className="text-xs text-red-400">손절</div>
                    <div className="text-sm font-bold text-red-400">${setup.stop_price?.toFixed(4)}</div>
                  </div>
                </div>

                {setup.risk_reward && (
                  <div className="text-xs text-gray-400 mb-2">R:R = {setup.risk_reward.toFixed(2)}:1</div>
                )}

                <p className="text-xs text-gray-400 mb-4 leading-relaxed">{setup.scan_reasoning}</p>

                {setup.status !== 'traded' && setup.status !== 'rejected' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => approve(setup.id)}
                      disabled={actionId === setup.id}
                      className="flex-1 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 rounded-lg py-2 font-semibold text-sm transition-colors"
                    >
                      {actionId === setup.id ? '처리 중...' : '✅ 실행'}
                    </button>
                    <button
                      onClick={() => reject(setup.id)}
                      disabled={actionId === setup.id}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 rounded-lg py-2 font-semibold text-sm transition-colors"
                    >
                      ❌ 건너뜀
                    </button>
                  </div>
                )}

                {(setup.status === 'traded' || setup.status === 'rejected') && (
                  <div className="text-center text-xs text-gray-500">
                    {setup.status === 'traded' ? '✅ 실행됨' : '❌ 건너뜀'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
