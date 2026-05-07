'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface IncomeEntry {
  id: number; amount: number; currency: string; category: string;
  description: string; date: string; created_at: string;
}
interface ExpenseEntry {
  id: number; amount: number; currency: string; category: string;
  merchant: string; description: string; date: string; created_at: string;
}

type SubTab = 'income' | 'expense';
type Period = 'all' | 'month' | 'year';

const INCOME_CATEGORIES = ['급여', '투자수익', '부업', '보너스', '기타'];
const EXPENSE_CATEGORIES = ['식비', '교통', '쇼핑', '주거', '의료', '교육', '기타'];
const CURRENCIES = ['VND', 'KRW', 'USD', 'USDT'];

function fmt(amount: number, currency: string): string {
  if (currency === 'VND') return '₫' + new Intl.NumberFormat('vi-VN').format(amount);
  if (currency === 'KRW') return '₩' + new Intl.NumberFormat('ko-KR').format(amount);
  if (currency === 'USD' || currency === 'USDT') return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  return new Intl.NumberFormat().format(amount) + ' ' + currency;
}

function compressImage(file: File, maxW = 1200, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function filterByPeriod<T extends { date: string }>(items: T[], period: Period): T[] {
  if (period === 'all') return items;
  const now = new Date();
  return items.filter(i => {
    const d = new Date(i.date);
    if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return d.getFullYear() === now.getFullYear();
  });
}

const periodLabel: Record<Period, string> = { all: '전체', month: '이번 달', year: '올해' };
const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300';
const selectCls = 'border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300';
const labelCls = 'text-xs font-medium text-gray-500 block mb-1.5';

export default function ChongTab() {
  const [subTab, setSubTab] = useState<SubTab>('income');

  // Income
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [inPeriod, setInPeriod] = useState<Period>('month');
  const [inAmount, setInAmount] = useState('');
  const [inCurrency, setInCurrency] = useState('VND');
  const [inCategory, setInCategory] = useState('급여');
  const [inDesc, setInDesc] = useState('');
  const [inDate, setInDate] = useState(new Date().toISOString().slice(0, 10));
  const [inSubmitting, setInSubmitting] = useState(false);

  // Expense
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [exPeriod, setExPeriod] = useState<Period>('month');
  const [exAmount, setExAmount] = useState('');
  const [exCurrency, setExCurrency] = useState('VND');
  const [exCategory, setExCategory] = useState('식비');
  const [exMerchant, setExMerchant] = useState('');
  const [exDesc, setExDesc] = useState('');
  const [exDate, setExDate] = useState(new Date().toISOString().slice(0, 10));
  const [exSubmitting, setExSubmitting] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchIncomes = useCallback(async () => {
    const res = await fetch('/api/personal/income');
    if (res.ok) { const d = await res.json(); setIncomes(d.items ?? []); }
  }, []);

  const fetchExpenses = useCallback(async () => {
    const res = await fetch('/api/personal/expenses');
    if (res.ok) { const d = await res.json(); setExpenses(d.items ?? []); }
  }, []);

  useEffect(() => { fetchIncomes(); }, [fetchIncomes]);
  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  async function handleAddIncome(e: React.FormEvent) {
    e.preventDefault();
    if (!inAmount.trim()) return;
    setInSubmitting(true);
    await fetch('/api/personal/income', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(inAmount.replace(/,/g, '')), currency: inCurrency, category: inCategory, description: inDesc, date: inDate }),
    });
    setInAmount(''); setInDesc('');
    await fetchIncomes();
    setInSubmitting(false);
  }

  async function handleDeleteIncome(id: number) {
    await fetch(`/api/personal/income/${id}`, { method: 'DELETE' });
    setIncomes(prev => prev.filter(i => i.id !== id));
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true); setOcrMsg('영수증 분석 중...');
    try {
      const base64 = await compressImage(file);
      const res = await fetch('/api/personal/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64 }) });
      if (res.ok) {
        const d = await res.json();
        if (d.amount) setExAmount(String(d.amount));
        if (d.currency && CURRENCIES.includes(d.currency)) setExCurrency(d.currency);
        if (d.category && EXPENSE_CATEGORIES.includes(d.category)) setExCategory(d.category);
        if (d.merchant) setExMerchant(d.merchant);
        if (d.date) setExDate(d.date);
        setOcrMsg('영수증 정보를 가져왔어요. 확인 후 저장하세요.');
      } else { const err = await res.json(); setOcrMsg(err.error ?? 'OCR 실패 — 수동 입력해주세요.'); }
    } catch { setOcrMsg('이미지 처리 실패'); }
    setOcrLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!exAmount.trim()) return;
    setExSubmitting(true);
    await fetch('/api/personal/expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(exAmount.replace(/,/g, '')), currency: exCurrency, category: exCategory, merchant: exMerchant, description: exDesc, date: exDate }),
    });
    setExAmount(''); setExMerchant(''); setExDesc(''); setOcrMsg('');
    await fetchExpenses();
    setExSubmitting(false);
  }

  async function handleDeleteExpense(id: number) {
    setExpenses(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/personal/expenses/${id}`, { method: 'DELETE' });
    await fetchExpenses();
  }

  const filteredIncomes = filterByPeriod(incomes, inPeriod);
  const filteredExpenses = filterByPeriod(expenses, exPeriod);

  const incomeTotal: Record<string, number> = {};
  for (const i of filteredIncomes) incomeTotal[i.currency] = (incomeTotal[i.currency] ?? 0) + Number(i.amount);

  const expenseTotal: Record<string, number> = {};
  const expenseByCategory: Record<string, Record<string, number>> = {};
  for (const e of filteredExpenses) {
    expenseTotal[e.currency] = (expenseTotal[e.currency] ?? 0) + Number(e.amount);
    if (!expenseByCategory[e.currency]) expenseByCategory[e.currency] = {};
    expenseByCategory[e.currency][e.category] = (expenseByCategory[e.currency][e.category] ?? 0) + Number(e.amount);
  }

  return (
    <div className="space-y-3">
      {/* Sub-tab nav */}
      <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
        <button onClick={() => setSubTab('income')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${subTab === 'income' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500'}`}>
          📈 수입 <span className="opacity-60">Thu nhập</span>
        </button>
        <button onClick={() => setSubTab('expense')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${subTab === 'expense' ? 'bg-white shadow-sm text-rose-600' : 'text-gray-500'}`}>
          📉 지출 <span className="opacity-60">Chi tiêu</span>
        </button>
      </div>

      {/* ── 수입 탭 ── */}
      {subTab === 'income' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">수입 기록 · <span className="text-gray-400 font-normal">Ghi thu nhập</span></h3>
            <form onSubmit={handleAddIncome} className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelCls}>금액</label>
                  <input type="text" inputMode="numeric" value={inAmount}
                    onChange={e => setInAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>통화</label>
                  <select value={inCurrency} onChange={e => setInCurrency(e.target.value)} className={selectCls}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelCls}>카테고리</label>
                  <select value={inCategory} onChange={e => setInCategory(e.target.value)} className={`${selectCls} w-full`}>
                    {INCOME_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className={labelCls}>날짜</label>
                  <input type="date" value={inDate} onChange={e => setInDate(e.target.value)} required className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>메모 (선택)</label>
                <input type="text" value={inDesc} onChange={e => setInDesc(e.target.value)} placeholder="급여, 프리랜서 등" className={inputCls} />
              </div>
              <button type="submit" disabled={inSubmitting || !inAmount.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
                {inSubmitting ? '저장 중...' : '수입 저장'}
              </button>
            </form>
          </div>

          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500 font-medium">기간:</span>
            {(['all', 'month', 'year'] as Period[]).map(p => (
              <button key={p} onClick={() => setInPeriod(p)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${inPeriod === p ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {periodLabel[p]}
              </button>
            ))}
          </div>

          {Object.keys(incomeTotal).length > 0 && (
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
              <p className="text-xs font-semibold text-emerald-700 mb-1">{periodLabel[inPeriod]} 총 수입</p>
              {Object.entries(incomeTotal).map(([cur, amt]) => (
                <p key={cur} className="text-base font-bold text-emerald-800">{fmt(amt, cur)}</p>
              ))}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {filteredIncomes.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm"><p className="text-2xl mb-2">📈</p><p>수입 내역이 없어요</p></div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {filteredIncomes.map(item => (
                  <li key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">{item.category}</span>
                        {item.description && <span className="text-xs text-gray-500 truncate">{item.description}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{item.date}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-bold text-emerald-700">{fmt(item.amount, item.currency)}</span>
                      <button onClick={() => handleDeleteIncome(item.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1">✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── 지출 탭 ── */}
      {subTab === 'expense' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">지출 기록 · <span className="text-gray-400 font-normal">Ghi chi tiêu</span></h3>
              <label className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${ocrLoading ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                {ocrLoading ? '분석 중...' : '📷 영수증'}
                <input ref={fileRef} type="file" accept="image/*" capture="environment"
                  className="hidden" disabled={ocrLoading} onChange={handleReceiptUpload} />
              </label>
            </div>
            {ocrMsg && (
              <p className={`text-xs px-3 py-2 rounded-lg ${ocrMsg.includes('가져왔') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{ocrMsg}</p>
            )}
            <form onSubmit={handleAddExpense} className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelCls}>금액</label>
                  <input type="text" inputMode="numeric" value={exAmount}
                    onChange={e => setExAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>통화</label>
                  <select value={exCurrency} onChange={e => setExCurrency(e.target.value)} className={selectCls}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelCls}>카테고리</label>
                  <select value={exCategory} onChange={e => setExCategory(e.target.value)} className={`${selectCls} w-full`}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className={labelCls}>날짜</label>
                  <input type="date" value={exDate} onChange={e => setExDate(e.target.value)} required className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>상호명 (선택)</label>
                <input type="text" value={exMerchant} onChange={e => setExMerchant(e.target.value)} placeholder="마트, 식당명 등" className={inputCls} />
              </div>
              <button type="submit" disabled={exSubmitting || !exAmount.trim()}
                className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
                {exSubmitting ? '저장 중...' : '지출 저장'}
              </button>
            </form>
          </div>

          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500 font-medium">기간:</span>
            {(['all', 'month', 'year'] as Period[]).map(p => (
              <button key={p} onClick={() => setExPeriod(p)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${exPeriod === p ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {periodLabel[p]}
              </button>
            ))}
          </div>

          {Object.keys(expenseTotal).length > 0 && (
            <div className="bg-rose-50 rounded-xl p-3 border border-rose-100 space-y-2">
              <p className="text-xs font-semibold text-rose-700">{periodLabel[exPeriod]} 총 지출</p>
              {Object.entries(expenseTotal).map(([cur, amt]) => (
                <p key={cur} className="text-base font-bold text-rose-800">{fmt(amt, cur)}</p>
              ))}
              {Object.entries(expenseByCategory).map(([cur, cats]) => (
                <div key={cur} className="grid grid-cols-2 gap-1 mt-1">
                  {Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between bg-white/60 rounded-lg px-2 py-1">
                      <span className="text-xs text-gray-600">{cat}</span>
                      <span className="text-xs font-medium text-rose-700">{fmt(amt, cur)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {filteredExpenses.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm"><p className="text-2xl mb-2">📉</p><p>지출 내역이 없어요</p></div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {filteredExpenses.map(item => (
                  <li key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-rose-100 text-rose-700 font-medium px-2 py-0.5 rounded-full">{item.category}</span>
                        {item.merchant && <span className="text-xs text-gray-700 font-medium truncate">{item.merchant}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{item.date}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-bold text-rose-700">{fmt(item.amount, item.currency)}</span>
                      <button onClick={() => handleDeleteExpense(item.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1">✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
