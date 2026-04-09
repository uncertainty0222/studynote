'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
  const router = useRouter();
  const [husbandName, setHusbandName] = useState('');
  const [husbandEmail, setHusbandEmail] = useState('');
  const [husbandPw, setHusbandPw] = useState('');
  const [wifeName, setWifeName] = useState('');
  const [wifeEmail, setWifeEmail] = useState('');
  const [wifePw, setWifePw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        husband: { name: husbandName, email: husbandEmail, password: husbandPw },
        wife: { name: wifeName, email: wifeEmail, password: wifePw },
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error); return; }
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm w-full max-w-md p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">초기 설정</h1>
        <p className="text-sm text-gray-500 mb-6">두 분의 계정을 만들어주세요. 한 번만 하면 됩니다.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Husband */}
          <div className="bg-blue-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-700">남편 계정</p>
            <input
              placeholder="이름"
              value={husbandName}
              onChange={e => setHusbandName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              required
            />
            <input
              type="email"
              placeholder="이메일"
              value={husbandEmail}
              onChange={e => setHusbandEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              required
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={husbandPw}
              onChange={e => setHusbandPw(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              required
            />
          </div>

          {/* Wife */}
          <div className="bg-rose-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-rose-600">아내 계정</p>
            <input
              placeholder="이름"
              value={wifeName}
              onChange={e => setWifeName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300"
              required
            />
            <input
              type="email"
              placeholder="이메일"
              value={wifeEmail}
              onChange={e => setWifeEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300"
              required
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={wifePw}
              onChange={e => setWifePw(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300"
              required
            />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors text-sm"
          >
            {loading ? '설정 중...' : '계정 생성 완료'}
          </button>
        </form>
      </div>
    </div>
  );
}
