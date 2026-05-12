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
}

interface AnalysisResult {
  saved: number;
  skipped: number;
  errors: string[];
  patternsFound: number;
  timingContextsFetched: number;
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
  const [urlInput, setUrlInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, []);

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

  async function analyzeUrls() {
    const lines = urlInput.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { setError('URL을 입력하세요'); return; }

    setAnalyzing(true);
    setResult(null);
    setError('');

    try {
      const res = await fetch('/api/trading/tweets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: lines }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '분석 실패'); return; }
      setResult(data as AnalysisResult);
      if (data.saved > 0 || data.patternsFound > 0) {
        setUrlInput('');
        await loadData();
      }
    } catch {
      setError('네트워크 오류');
    } finally {
      setAnalyzing(false);
    }
  }

  async function scanMarket() {
    setScanning(true);
    setError('');
    try {
      const res = await fetch('/api/trading/scan-now', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setResult({ saved: data.saved, skipped: 0, errors: [], patternsFound: 0, timingContextsFetched: 0 });
        await loadData();
      } else {
        setError(data.error ?? '스캔 실패');
      }
    } catch {
      setError('스캔 중 오류 발생');
    } finally {
      setScanning(false);
    }
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
      <div className="grid grid-cols-2 gap-3 mb-5">
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

      {/* 스타일 학습 현황 */}
      <div className="bg-gray-800 rounded-xl p-4 mb-5">
        <div className="text-gray-400 text-xs mb-1">HaxKai 스타일 학습 현황</div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-blue-400">{status?.styleProfileTweetCount ?? 0}개</span>
          <span className="text-gray-400 text-sm">차트 아이디어 분석됨</span>
          {status?.styleProfileVersion && (
            <span className="text-gray-600 text-xs">v{status.styleProfileVersion}</span>
          )}
        </div>
        {(status?.styleProfileTweetCount ?? 0) < 10 && (
          <p className="text-yellow-400 text-xs mt-2">
            ⚠️ 스캔 정확도를 위해 HaxKai 차트 아이디어 최소 10개 이상 입력 권장
          </p>
        )}
      </div>

      {/* URL 입력 섹션 */}
      <div className="bg-gray-800 rounded-xl p-4 mb-5">
        <div className="text-sm font-semibold mb-3 text-blue-300">
          📎 HaxKai 트윗 URL 입력
        </div>
        <p className="text-xs text-gray-400 mb-3">
          HaxKai가 올린 차트 아이디어 트윗 URL을 붙여넣으세요.<br/>
          여러 개는 줄바꿈으로 구분 · 과거 트윗도 OK
        </p>
        <textarea
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder={`https://twitter.com/HaxKai/status/...\nhttps://x.com/HaxKai/status/...`}
          rows={4}
          className="w-full bg-gray-700 rounded-lg p-3 text-sm font-mono text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button
          onClick={analyzeUrls}
          disabled={analyzing || !urlInput.trim()}
          className="mt-3 w-full bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg py-3 font-semibold transition-colors"
        >
          {analyzing ? '⏳ 분석 중... (차트 + 타이밍 컨텍스트)' : '🔍 분석 시작'}
        </button>
      </div>

      {/* 분석 결과 */}
      {result && (
        <div className="bg-gray-800 rounded-xl p-4 mb-5 border border-blue-800">
          <div className="text-sm font-semibold text-blue-300 mb-2">✅ 분석 완료</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xl font-bold text-green-400">{result.saved}</div>
              <div className="text-xs text-gray-400">새 트윗 저장</div>
            </div>
            <div>
              <div className="text-xl font-bold text-blue-400">{result.patternsFound}</div>
              <div className="text-xs text-gray-400">TA 패턴 추출</div>
            </div>
            <div>
              <div className="text-xl font-bold text-purple-400">{result.timingContextsFetched}</div>
              <div className="text-xs text-gray-400">타이밍 분석</div>
            </div>
          </div>
          {result.skipped > 0 && (
            <p className="text-xs text-gray-500 mt-2">이미 저장된 트윗 {result.skipped}개 건너뜀</p>
          )}
          {result.errors.length > 0 && (
            <div className="mt-2">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-400">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-xl p-3 mb-5 text-sm text-red-300">
          ❌ {error}
        </div>
      )}

      {/* 네비게이션 + 시장 스캔 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Link href="/trading/setups" className="bg-yellow-800 hover:bg-yellow-700 rounded-xl p-4 text-center transition-colors">
          <div className="text-xl mb-1">⚡</div>
          <div className="text-sm font-semibold">셋업 승인</div>
          {(status?.pendingSetupsCount ?? 0) > 0 && (
            <div className="text-yellow-300 text-xs mt-1">{status?.pendingSetupsCount}개 대기</div>
          )}
        </Link>
        <button
          onClick={scanMarket}
          disabled={scanning || (status?.styleProfileTweetCount ?? 0) < 5}
          className="bg-purple-800 hover:bg-purple-700 disabled:bg-gray-700 rounded-xl p-4 text-center transition-colors"
        >
          <div className="text-xl mb-1">🔭</div>
          <div className="text-sm font-semibold">{scanning ? '스캔 중...' : '즉시 스캔'}</div>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href="/trading/history" className="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 text-center transition-colors">
          <div className="text-xl mb-1">📊</div>
          <div className="text-sm font-semibold">매매 내역</div>
        </Link>
        <Link href="/api/trading/style-profile" target="_blank" className="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 text-center transition-colors">
          <div className="text-xl mb-1">🧠</div>
          <div className="text-sm font-semibold">스타일 분석</div>
        </Link>
      </div>

      {/* 최근 분석된 트윗 목록 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3">최근 분석 기록</h2>
        {tweets.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
            위에서 트윗 URL을 입력하면 여기에 분석 기록이 쌓입니다
          </div>
        ) : (
          <div className="space-y-3">
            {tweets.slice(0, 10).map((tweet) => (
              <div key={tweet.id} className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm text-gray-300 flex-1 leading-relaxed">
                    {tweet.text.slice(0, 180)}{tweet.text.length > 180 ? '...' : ''}
                  </p>
                  <span className={`shrink-0 text-xs px-2 py-1 rounded-full ${tweet.processed ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                    {tweet.processed ? '분석완료' : '처리중'}
                  </span>
                </div>
                {tweet.media_urls.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {tweet.media_urls.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt="chart" className="w-24 h-16 object-cover rounded-lg" />
                    ))}
                  </div>
                )}
                <div className="text-xs text-gray-600 mt-2">
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
