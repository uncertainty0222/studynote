'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface BotStatus {
  tradingEnabled: boolean;
  lastTweetFetch: string | null;
  styleProfileVersion: number | null;
  styleProfileTweetCount: number;
  pendingSetupsCount: number;
  openTradesCount: number;
  todayPnlUsdt: number;
  todayLossUsdt: number;
  todayTradeCount: number;
  maxDailyLossUsdt: number;
  checkedAt: string;
}

interface Tweet {
  id: string;
  text: string;
  created_at: string;
  media_urls: string[];
  processed: boolean;
}

export default function TradingDashboard() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [statusRes, tweetsRes] = await Promise.all([
      fetch('/api/trading/status'),
      fetch('/api/trading/tweets'),
    ]);
    if (statusRes.ok) setStatus(await statusRes.json());
    if (tweetsRes.ok) {
      const data = await tweetsRes.json();
      setTweets(data.tweets ?? []);
    }
    setLoading(false);
  }

  async function fetchTweets() {
    setFetching(true);
    setMsg('');
    try {
      const res = await fetch('/api/trading/tweets', { method: 'POST' });
      const data = await res.json();
      setMsg(`✅ 트윗 ${data.fetched}개 수집, ${data.patternsFound}개 패턴 추출`);
      await loadData();
    } catch {
      setMsg('❌ 트윗 수집 실패');
    }
    setFetching(false);
  }

  async function scanMarket() {
    setScanning(true);
    setMsg('');
    try {
      const res = await fetch('/api/trading/scan-now', { method: 'POST' });
      const data = await res.json();
      setMsg(`✅ 스캔 완료: ${data.scanned}개 확인, ${data.saved}개 저장, ${data.alerted}개 알림`);
      await loadData();
    } catch {
      setMsg('❌ 스캔 실패');
    }
    setScanning(false);
  }

  if (loading) return <div className="p-8 text-center text-gray-500">로딩 중...</div>;

  const pnlColor = (status?.todayPnlUsdt ?? 0) >= 0 ? 'text-green-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🤖 HaxKai 트레이딩 봇</h1>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${status?.tradingEnabled ? 'bg-green-800 text-green-200' : 'bg-yellow-800 text-yellow-200'}`}>
          {status?.tradingEnabled ? '활성' : 'Paper Mode'}
        </span>
      </div>

      {/* 오늘 현황 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="text-gray-400 text-xs mb-1">오늘 P&L</div>
          <div className={`text-2xl font-bold ${pnlColor}`}>
            {(status?.todayPnlUsdt ?? 0) >= 0 ? '+' : ''}${(status?.todayPnlUsdt ?? 0).toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="text-gray-400 text-xs mb-1">일일 손실 한도</div>
          <div className="text-2xl font-bold">
            <span className="text-red-400">${(status?.todayLossUsdt ?? 0).toFixed(0)}</span>
            <span className="text-gray-500 text-sm"> / ${status?.maxDailyLossUsdt ?? 200}</span>
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="text-gray-400 text-xs mb-1">오픈 포지션</div>
          <div className="text-2xl font-bold">{status?.openTradesCount ?? 0}</div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="text-gray-400 text-xs mb-1">대기 셋업</div>
          <div className="text-2xl font-bold text-yellow-400">{status?.pendingSetupsCount ?? 0}</div>
        </div>
      </div>

      {/* 스타일 프로파일 현황 */}
      <div className="bg-gray-800 rounded-xl p-4 mb-4">
        <div className="text-gray-400 text-xs mb-2">HaxKai 스타일 학습 현황</div>
        <div className="flex items-center gap-4">
          <div>
            <span className="text-lg font-bold text-blue-400">{status?.styleProfileTweetCount ?? 0}</span>
            <span className="text-gray-400 text-sm ml-1">개 패턴 분석됨</span>
          </div>
          {status?.styleProfileVersion && (
            <span className="text-gray-500 text-xs">v{status.styleProfileVersion}</span>
          )}
        </div>
        {(status?.styleProfileTweetCount ?? 0) < 20 && (
          <p className="text-yellow-400 text-xs mt-2">
            ⚠️ 정확한 스캔을 위해 최소 20개 패턴이 필요합니다 (현재 {status?.styleProfileTweetCount ?? 0}개)
          </p>
        )}
      </div>

      {/* 액션 버튼 */}
      {msg && <div className="bg-gray-800 rounded-xl p-3 mb-4 text-sm">{msg}</div>}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={fetchTweets}
          disabled={fetching}
          className="bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 rounded-xl p-4 font-semibold transition-colors"
        >
          {fetching ? '수집 중...' : '📥 트윗 수집'}
        </button>
        <button
          onClick={scanMarket}
          disabled={scanning || (status?.styleProfileTweetCount ?? 0) < 5}
          className="bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 rounded-xl p-4 font-semibold transition-colors"
        >
          {scanning ? '스캔 중...' : '🔍 즉시 스캔'}
        </button>
      </div>

      {/* 네비게이션 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Link href="/trading/setups" className="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 text-center transition-colors">
          <div className="text-xl mb-1">⚡</div>
          <div className="text-sm font-semibold">셋업 승인</div>
        </Link>
        <Link href="/trading/history" className="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 text-center transition-colors">
          <div className="text-xl mb-1">📊</div>
          <div className="text-sm font-semibold">매매 내역</div>
        </Link>
        <Link href="/api/trading/style-profile" target="_blank" className="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 text-center transition-colors">
          <div className="text-xl mb-1">🧠</div>
          <div className="text-sm font-semibold">스타일 분석</div>
        </Link>
      </div>

      {/* 최근 트윗 */}
      <div>
        <h2 className="text-lg font-semibold mb-3">최근 HaxKai 트윗</h2>
        {tweets.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-6 text-center text-gray-500">
            트윗 없음 — 위 버튼으로 수집하세요
          </div>
        ) : (
          <div className="space-y-3">
            {tweets.slice(0, 10).map((tweet) => (
              <div key={tweet.id} className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm text-gray-300 flex-1 leading-relaxed">{tweet.text.slice(0, 200)}{tweet.text.length > 200 ? '...' : ''}</p>
                  <span className={`shrink-0 text-xs px-2 py-1 rounded-full ${tweet.processed ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                    {tweet.processed ? '분석됨' : '미처리'}
                  </span>
                </div>
                {tweet.media_urls.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {tweet.media_urls.map((url, i) => (
                      <img key={i} src={url} alt="chart" className="w-20 h-14 object-cover rounded-lg" />
                    ))}
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-2">
                  {new Date(tweet.created_at).toLocaleString('ko-KR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
