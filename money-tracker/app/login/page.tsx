'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error); return; }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm w-full max-w-sm p-6">
        <div className="text-center mb-6">
          <p className="text-3xl mb-2">💑</p>
          <h1 className="text-2xl font-bold text-gray-900">우리 가계부</h1>
          <p className="text-sm text-gray-400 mt-1">Sổ Chi Tiêu Chung</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">아이디 / Tên đăng nhập</label>
            <input
              type="text"
              placeholder="INHWA 또는 NHI"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              required
              autoCapitalize="characters"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">비밀번호 / Mật khẩu</label>
            <input
              type="password"
              placeholder="••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              required
            />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors text-sm mt-1"
          >
            {loading ? '로그인 중...' : '로그인 / Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
