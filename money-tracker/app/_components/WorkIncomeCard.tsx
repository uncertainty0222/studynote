'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WorkYear } from '@/lib/workIncome';

interface Resp { configured: boolean; years?: WorkYear[]; fetchedAt?: string; stale?: boolean; error?: string; }

const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const vnd = (n: number) => `${n < 0 ? '-' : ''}₫${new Intl.NumberFormat('vi-VN').format(Math.abs(Math.round(n)))}`;

export default function WorkIncomeCard({ usdToVnd }: { usdToVnd: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);

  const apply = (d: Resp) => {
    setData(d);
    const ys = d.years ?? [];
    if (ys.length) {
      const thisYear = new Date().getFullYear();
      const def = ys.find(y => y.year === thisYear) ?? ys[ys.length - 1];
      setYear(prev => (prev && ys.some(y => y.year === prev) ? prev : def.year));
      setMonth(prev => prev ?? def.months[def.months.length - 1]?.month ?? null);
    }
  };

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    const res = await fetch(`/api/personal/work-income${refresh ? '?refresh=1' : ''}`);
    apply(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch('/api/personal/work-income').then(r => r.json()).then(apply).catch(() => {});
  }, []);

  async function saveUrl() {
    setSaving(true); setSaveErr('');
    const res = await fetch('/api/personal/work-income', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: urlInput }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveErr(d.error ?? '오류'); return; }
    setEditing(false); setUrlInput(''); setYear(null); setMonth(null);
    apply(d);
  }

  const title = (
    <div>
      <h2 className="text-base font-bold text-gray-800 leading-tight">투어 수익</h2>
      <p className="text-xs text-gray-400">Thu nhập tour</p>
    </div>
  );
  const header = <div className="mb-3">{title}</div>;

  if (!data) {
    return <div className="bg-white rounded-2xl shadow-sm p-4">{header}<p className="text-xs text-gray-400 text-center py-6">불러오는 중...</p></div>;
  }

  if (!data.configured || editing) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-4">
        {header}
        <ol className="text-xs text-gray-600 space-y-1 list-decimal pl-4 mb-3">
          <li>workandlife 파일을 열고 <b>파일 → Google Sheets로 저장</b> (앞으로는 이 새 시트에 기록)</li>
          <li>새 시트에서 <b>파일 → 공유 → 웹에 게시</b></li>
          <li><b>workandlife</b> 탭 선택, 형식은 <b>쉼표로 구분된 값(.csv)</b> → 게시</li>
          <li>나온 링크를 아래에 붙여넣기</li>
        </ol>
        <div className="flex gap-2">
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?...output=csv"
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <button onClick={saveUrl} disabled={saving || !urlInput.trim()} className="bg-indigo-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg">
            {saving ? '확인 중...' : '연결'}
          </button>
        </div>
        {saveErr && <p className="text-xs text-rose-500 mt-2">{saveErr}</p>}
        {editing && <button onClick={() => { setEditing(false); setSaveErr(''); }} className="text-xs text-gray-400 mt-2">취소</button>}
      </div>
    );
  }

  const years = data.years ?? [];
  if (years.length === 0) {
    return <div className="bg-white rounded-2xl shadow-sm p-4">{header}<p className="text-xs text-rose-500">{data.error ?? '데이터가 없어요'}</p></div>;
  }

  const y = years.find(v => v.year === year) ?? years[years.length - 1];
  const sel = y.months.find(m => m.month === month) ?? y.months[y.months.length - 1];
  const max = Math.max(1, ...y.months.map(m => m.total));
  const avg = y.months.length ? y.total / y.months.length : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-start justify-between mb-3">
        {title}
        {/* Year picker: pill look, native select underneath for the OS picker */}
        <label className="relative flex items-center gap-1 pl-3 pr-2.5 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-bold active:bg-indigo-100">
          {y.year}
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <select value={y.year} aria-label="연도 선택"
            onChange={e => { const v = years.find(x => x.year === Number(e.target.value)); if (v) { setYear(v.year); setMonth(v.months[v.months.length - 1]?.month ?? null); } }}
            className="absolute inset-0 opacity-0 cursor-pointer">
            {[...years].reverse().map(v => <option key={v.year} value={v.year}>{v.year}년 · {usd(v.total)}</option>)}
          </select>
        </label>
      </div>

      {/* Year summary */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-gray-50 rounded-xl px-3 py-2">
          <p className="text-[11px] text-gray-400">{y.year}년 합계 · Tổng năm</p>
          <p className="text-base font-bold text-gray-800 leading-tight">{usd(y.total)}</p>
          <p className="text-[11px] text-gray-400">{vnd(y.total * usdToVnd)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2">
          <p className="text-[11px] text-gray-400">월평균 · TB tháng</p>
          <p className="text-base font-bold text-gray-800 leading-tight">{usd(avg)}</p>
          <p className="text-[11px] text-gray-400">{vnd(avg * usdToVnd)}</p>
        </div>
      </div>

      {data.stale && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 mb-3">
          시트를 지금 읽지 못해서 마지막으로 불러온 값을 보여줘요 · {new Date(data.fetchedAt ?? '').toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기준
        </p>
      )}

      {/* Selected month headline */}
      <div className="mb-2">
        <p className="text-xs text-gray-500">{y.year}년 {sel.month}월 · Tháng {sel.month}</p>
        <p className="text-2xl font-black text-gray-900 tracking-tight">
          {usd(sel.total)} <span className="text-sm font-semibold text-gray-400 tracking-normal">{vnd(sel.total * usdToVnd)}</span>
        </p>
      </div>

      {/* Monthly bars */}
      <div className="relative h-36 flex items-end gap-0.5 border-b border-gray-200" role="img" aria-label={`${y.year}년 월별 근로수익`}>
        <div className="absolute left-0 right-0 border-t border-dashed border-gray-200" style={{ bottom: `${(avg / max) * 100}%` }} />
        {y.months.map(m => {
          const h = Math.max(0, m.total) / max * 100;
          const active = m.month === sel.month;
          return (
            <button key={m.month} onClick={() => setMonth(m.month)} title={`${m.month}월 ${usd(m.total)}`}
              className="relative flex-1 h-full flex items-end justify-center group">
              <span className={`w-full max-w-[22px] rounded-t transition-colors ${active ? 'bg-indigo-600' : 'bg-indigo-300 group-hover:bg-indigo-400'}`}
                style={{ height: `${h}%`, minHeight: m.total > 0 ? 2 : 0 }} />
            </button>
          );
        })}
      </div>
      <div className="flex gap-0.5 mt-1">
        {y.months.map(m => (
          <span key={m.month} className={`flex-1 text-center text-[10px] ${m.month === sel.month ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>{m.month}</span>
        ))}
      </div>

      {/* Tours of selected month */}
      <div className="mt-4">
        <p className="text-xs font-semibold text-gray-600 mb-1.5">{sel.month}월 투어 {sel.tours.length}건 · {sel.tours.length} tour</p>
        {sel.tours.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">기록 없음 · Không có dữ liệu</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sel.tours.map((t, i) => (
              <li key={i} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-gray-800 truncate">{t.name}</p>
                  <p className={`text-sm font-semibold flex-shrink-0 ${t.settle !== null && t.settle < 0 ? 'text-rose-600' : 'text-gray-900'}`}>{t.settle === null ? '—' : <>{usd(t.settle)} <span className="text-xs font-normal text-gray-400">{vnd(t.settle * usdToVnd)}</span></>}</p>
                </div>
                <p className="text-[11px] text-gray-400">
                  {[t.people && `${t.people}명`, t.payout !== null && `정산 ${usd(t.payout)}`, t.tip && `팁 ${usd(t.tip)}`,
                    t.extraPlus && `그외+ ${usd(t.extraPlus)}`, t.extraMinus && `그외- ${usd(t.extraMinus)}`].filter(Boolean).join(' · ')}
                </p>
                {t.note && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{t.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400">
        <span>Google Sheets 연동 · Đồng bộ</span>
        <span className="flex items-center gap-3">
          <button onClick={() => load(true)} disabled={loading} className="text-indigo-500 disabled:opacity-40">{loading ? '불러오는 중...' : '새로고침'}</button>
          <button onClick={() => setEditing(true)}>링크 변경</button>
        </span>
      </div>
    </div>
  );
}
