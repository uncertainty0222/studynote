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

type SubTab = 'dashboard' | 'income' | 'expense';
type Period = 'all' | 'month' | 'year';

const INCOME_CATEGORIES = ['급여', '투자수익', '부업', '보너스', '기타'];
const EXPENSE_CATEGORIES = ['외식', '생활비', '교통', '쇼핑', '주거', '의료', '카페', '구독', '교육', '기타'];
const CURRENCIES = ['VND', 'KRW', 'USD', 'USDT'];

const CATEGORY_COLORS: Record<string, string> = {
  '외식': '#f87171', '생활비': '#fb923c', '교통': '#facc15', '쇼핑': '#f472b6',
  '주거': '#fbbf24', '의료': '#34d399', '카페': '#22d3ee', '구독': '#a78bfa',
  '교육': '#60a5fa', '기타': '#94a3b8',
};

function toUsd(amount: number, currency: string, usdToVnd: number, usdToKrw: number): number {
  if (currency === 'VND') return amount / usdToVnd;
  if (currency === 'KRW') return amount / usdToKrw;
  return amount;
}

const LEVEL_TITLES = ['', '새내기 🌱', '절약 견습생 🐣', '가계부 마스터 📒', '자산 수호자 🛡️', '현금흐름 왕 👑', '전설의 재테크러 🌟'];
const LEVEL_ICONS  = ['', '🌱', '🐣', '📒', '🛡️', '👑', '🌟'];

function MonthlyChart({ data }: { data: { key: string; income: number; expense: number; net: number }[] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height: '96px' }}>
        {data.map(d => {
          const incH = d.income > 0 ? Math.max((d.income / maxVal) * 100, 4) : 0;
          const expH = d.expense > 0 ? Math.max((d.expense / maxVal) * 100, 4) : 0;
          const month = String(parseInt(d.key.slice(5)));
          const isCurrentMonth = d.key === new Date().toISOString().slice(0, 7);
          return (
            <div key={d.key} className="flex-1 flex flex-col items-center">
              <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '80px' }}>
                <div className={`flex-1 rounded-t transition-all ${isCurrentMonth ? 'bg-emerald-500' : 'bg-emerald-300'}`}
                  style={{ height: `${incH}%` }} title={`수입 $${Math.round(d.income)}`} />
                <div className={`flex-1 rounded-t transition-all ${isCurrentMonth ? 'bg-rose-500' : 'bg-rose-300'}`}
                  style={{ height: `${expH}%` }} title={`지출 $${Math.round(d.expense)}`} />
              </div>
              <span className={`text-[10px] mt-1 ${isCurrentMonth ? 'text-indigo-600 font-semibold' : 'text-gray-400'}`}>{month}월</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-2 justify-center">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 flex-shrink-0 inline-block"></span>수입
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 flex-shrink-0 inline-block"></span>지출
        </span>
      </div>
    </div>
  );
}

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

function DonutChart({ data, total }: { data: [string, number][]; total: number }) {
  const size = 160; const stroke = 28; const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = data.map(([cat, amt]) => {
    const frac = amt / total;
    const dash = c * frac;
    const arc = { cat, dash, offset, color: CATEGORY_COLORS[cat] ?? '#94a3b8' };
    offset += dash;
    return arc;
  });
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
        {arcs.map(a => (
          <circle key={a.cat}
            cx={size/2} cy={size/2} r={r} fill="none"
            stroke={a.color} strokeWidth={stroke}
            strokeDasharray={`${a.dash} ${c - a.dash}`}
            strokeDashoffset={-a.offset}
            transform={`rotate(-90 ${size/2} ${size/2})`} />
        ))}
        <text x={size/2} y={size/2 - 2} textAnchor="middle" fontSize="18" fontWeight="700" fill="#111827">${Math.round(total).toLocaleString()}</text>
        <text x={size/2} y={size/2 + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">총 지출</text>
      </svg>
      <div className="flex-1 space-y-1 min-w-0">
        {data.slice(0, 6).map(([cat, amt]) => (
          <div key={cat} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[cat] ?? '#94a3b8' }}></span>
            <span className="text-gray-600 flex-1 truncate">{cat}</span>
            <span className="text-gray-500 font-medium">{Math.round(amt/total*100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyBarChart({ data, today }: { data: number[]; today: number }) {
  const max = Math.max(...data, 1);
  return (
    <div>
      <div className="flex items-end gap-0.5 h-24">
        {data.map((amt, i) => {
          const isToday = i + 1 === today;
          const hasValue = amt > 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-end">
              <div
                className={`w-full rounded-t ${isToday ? 'bg-rose-600' : hasValue ? 'bg-rose-300' : 'bg-gray-100'}`}
                style={{ height: hasValue ? `${Math.max((amt / max) * 100, 6)}%` : '4px' }}
                title={`${i+1}일: $${Math.round(amt)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
        <span>1일</span>
        <span>{Math.ceil(data.length/2)}일</span>
        <span>{data.length}일</span>
      </div>
    </div>
  );
}

export default function ChongTab() {
  const [subTab, setSubTab] = useState<SubTab>('dashboard');

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
  const [exCategory, setExCategory] = useState('외식');
  const [exMerchant, setExMerchant] = useState('');
  const [exDesc, setExDesc] = useState('');
  const [exDate, setExDate] = useState(new Date().toISOString().slice(0, 10));
  const [exSubmitting, setExSubmitting] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<{ category: string; merchant: string; amount: string; currency: string; date: string }>({ category: '', merchant: '', amount: '', currency: 'VND', date: '' });
  const [editSaving, setEditSaving] = useState(false);

  // Exchange rates for USD conversion
  const [usdToVnd, setUsdToVnd] = useState(25800);
  const [usdToKrw, setUsdToKrw] = useState(1380);

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
  useEffect(() => {
    fetch('/api/personal/vault').then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setUsdToVnd(d.usdToVnd); setUsdToKrw(d.usdToKrw); }
    });
  }, []);

  const [inErrMsg, setInErrMsg] = useState('');

  async function handleAddIncome(e: React.FormEvent) {
    e.preventDefault();
    if (!inAmount.trim()) return;
    setInSubmitting(true);
    setInErrMsg('');
    try {
      const res = await fetch('/api/personal/income', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(inAmount.replace(/,/g, '')), currency: inCurrency, category: inCategory, description: inDesc, date: inDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setInErrMsg(res.status === 401 ? '⚠️ 세션 만료 — 페이지를 새로고침해주세요' : `⚠️ 저장 실패: ${err.error ?? res.status}`);
        setInSubmitting(false);
        return;
      }
      setInAmount(''); setInDesc('');
      await fetchIncomes();
    } catch {
      setInErrMsg('⚠️ 네트워크 오류 — 다시 시도해주세요');
    }
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
        if (d.date) {
          const now = new Date();
          const parsed = new Date(d.date);
          const sameMonth = parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth();
          setExDate(d.date);
          if (!sameMonth) {
            setOcrMsg(`영수증 정보를 가져왔어요. ⚠️ 날짜가 ${d.date} (이번 달 아님) — 맞으면 그대로, 아니면 날짜를 수정해주세요.`);
          } else {
            setOcrMsg('영수증 정보를 가져왔어요. 확인 후 저장하세요.');
          }
        } else {
          setOcrMsg('영수증 정보를 가져왔어요. 확인 후 저장하세요.');
        }
      } else { const err = await res.json(); setOcrMsg(err.error ?? 'OCR 실패 — 수동 입력해주세요.'); }
    } catch { setOcrMsg('이미지 처리 실패'); }
    setOcrLoading(false);
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!exAmount.trim()) return;
    setExSubmitting(true);
    setOcrMsg('');
    try {
      const res = await fetch('/api/personal/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(exAmount.replace(/,/g, '')), currency: exCurrency, category: exCategory, merchant: exMerchant, description: exDesc, date: exDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setOcrMsg(res.status === 401 ? '⚠️ 세션 만료 — 페이지를 새로고침해주세요' : `⚠️ 저장 실패: ${err.error ?? res.status}`);
        setExSubmitting(false);
        return;
      }
      setExAmount(''); setExMerchant(''); setExDesc('');
      await fetchExpenses();
    } catch {
      setOcrMsg('⚠️ 네트워크 오류 — 다시 시도해주세요');
    }
    setExSubmitting(false);
  }

  async function handleDeleteExpense(id: number) {
    setExpenses(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/personal/expenses/${id}`, { method: 'DELETE' });
    await fetchExpenses();
  }

  function startEdit(item: ExpenseEntry) {
    setEditingId(item.id);
    setEditFields({ category: item.category, merchant: item.merchant ?? '', amount: String(Number(item.amount)), currency: item.currency, date: item.date });
  }

  async function saveEdit() {
    if (!editingId) return;
    setEditSaving(true);
    await fetch(`/api/personal/expenses/${editingId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editFields, amount: Math.round(Number(editFields.amount)) }),
    });
    setEditingId(null);
    await fetchExpenses();
    setEditSaving(false);
  }

  // Dashboard data (this month)
  const now = new Date();
  const isThisMonth = (date: string) => {
    const d = new Date(date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const monthIncomes = incomes.filter(i => isThisMonth(i.date));
  const monthExpenses = expenses.filter(e => isThisMonth(e.date));
  const incomeUsd = monthIncomes.reduce((s, i) => s + toUsd(Number(i.amount), i.currency, usdToVnd, usdToKrw), 0);
  const expenseUsd = monthExpenses.reduce((s, e) => s + toUsd(Number(e.amount), e.currency, usdToVnd, usdToKrw), 0);
  const netUsd = incomeUsd - expenseUsd;

  const catTotals: Record<string, number> = {};
  for (const e of monthExpenses) {
    const usd = toUsd(Number(e.amount), e.currency, usdToVnd, usdToKrw);
    catTotals[e.category] = (catTotals[e.category] ?? 0) + usd;
  }
  const sortedCats: [string, number][] = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyExpenses = new Array(daysInMonth).fill(0);
  for (const e of monthExpenses) {
    const d = new Date(e.date);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      dailyExpenses[d.getDate() - 1] += toUsd(Number(e.amount), e.currency, usdToVnd, usdToKrw);
    }
  }

  // ── 캐릭터 / 게임 통계 ──
  const allMonthKeys = [...new Set([
    ...incomes.map(i => i.date.slice(0, 7)),
    ...expenses.map(e => e.date.slice(0, 7)),
  ])].sort();

  const monthlyHistory = allMonthKeys.map(key => {
    const inc = incomes.filter(i => i.date.startsWith(key))
      .reduce((s, i) => s + toUsd(Number(i.amount), i.currency, usdToVnd, usdToKrw), 0);
    const exp = expenses.filter(e => e.date.startsWith(key))
      .reduce((s, e) => s + toUsd(Number(e.amount), e.currency, usdToVnd, usdToKrw), 0);
    return { key, income: inc, expense: exp, net: inc - exp };
  });

  const positiveMonths = monthlyHistory.filter(m => m.net > 0).length;
  let consecutivePositive = 0;
  for (let i = monthlyHistory.length - 1; i >= 0; i--) {
    if (monthlyHistory[i].net > 0) consecutivePositive++;
    else break;
  }
  const level = Math.min(Math.max(1, Math.floor(positiveMonths / 2) + 1), LEVEL_TITLES.length - 1);
  const expProgress = Math.round((positiveMonths % 2) / 2 * 100);
  const totalSavingsUsd = monthlyHistory.reduce((s, m) => s + m.net, 0);

  const last6Keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    last6Keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const last6Data = last6Keys.map(key => {
    const found = monthlyHistory.find(m => m.key === key);
    return { key, income: found?.income ?? 0, expense: found?.expense ?? 0, net: found?.net ?? 0 };
  });

  const incomePower  = Math.min(Math.round((incomeUsd / 500) * 100), 100);
  const selfControl  = incomeUsd > 0 ? Math.max(0, Math.round((1 - expenseUsd / incomeUsd) * 100)) : 0;
  const streakScore  = Math.min(consecutivePositive * 25, 100);

  const achievements = [
    { icon: '🌟', name: '첫 수입',    desc: '수입 기록 시작',       unlocked: incomes.length > 0 },
    { icon: '💰', name: '첫 흑자',    desc: '한 달 흑자 달성',      unlocked: positiveMonths >= 1 },
    { icon: '🔥', name: '연속 흑자',  desc: '2달 이상 연속 흑자',   unlocked: consecutivePositive >= 2 },
    { icon: '🛡️', name: '절약왕',    desc: '지출이 수입의 50% 이하', unlocked: incomeUsd > 0 && expenseUsd <= incomeUsd * 0.5 },
    { icon: '💎', name: '수입 $500', desc: '한 달 수입 $500 돌파',  unlocked: incomeUsd >= 500 },
    { icon: '🏆', name: '3달 연속',   desc: '3개월 연속 흑자 달성', unlocked: consecutivePositive >= 3 },
  ];

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
        <button onClick={() => setSubTab('dashboard')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${subTab === 'dashboard' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}>
          📊 대시
        </button>
        <button onClick={() => setSubTab('income')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${subTab === 'income' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500'}`}>
          📈 수입
        </button>
        <button onClick={() => setSubTab('expense')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${subTab === 'expense' ? 'bg-white shadow-sm text-rose-600' : 'text-gray-500'}`}>
          📉 지출
        </button>
      </div>

      {/* ── 대시보드 ── */}
      {subTab === 'dashboard' && (
        <div className="space-y-3">

          {/* ▶ 캐릭터 카드 */}
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-4 text-white shadow-lg">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-semibold tracking-wide">Lv.{level}</span>
                  <span className="text-[11px] text-white/60">다음 레벨까지 {2 - (positiveMonths % 2)}달 흑자</span>
                </div>
                <p className="text-xl font-bold leading-tight">{LEVEL_TITLES[level]}</p>
                <p className="text-xs text-white/50 mt-0.5">VOCHONG 가족</p>
              </div>
              <div className="text-5xl">{LEVEL_ICONS[level]}</div>
            </div>

            {/* EXP 바 */}
            <div className="mb-4">
              <div className="flex justify-between text-[11px] text-white/60 mb-1">
                <span>EXP</span>
                <span>{positiveMonths % 2}/2</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-300 rounded-full" style={{ width: `${expProgress}%` }} />
              </div>
            </div>

            {/* 스탯 바 3개 */}
            <div className="bg-white/10 rounded-xl p-3 space-y-3">
              {[
                { label: '💪 소득력',  value: incomePower, color: '#34d399' },
                { label: '🛡️ 절제력', value: selfControl,  color: '#60a5fa' },
                { label: '🔥 연속흑자', value: streakScore, color: '#fbbf24' },
              ].map(stat => (
                <div key={stat.label}>
                  <div className="flex justify-between text-xs text-white/80 mb-1">
                    <span>{stat.label}</span>
                    <span className="font-bold text-white">{stat.value}<span className="text-white/50 font-normal">/100</span></span>
                  </div>
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${stat.value}%`, background: stat.color }} />
                  </div>
                </div>
              ))}
            </div>

            {/* 누적 자산 */}
            <div className="mt-3 flex justify-between items-center border-t border-white/10 pt-3">
              <span className="text-xs text-white/60">누적 순자산 (USD)</span>
              <span className={`text-lg font-bold ${totalSavingsUsd >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {totalSavingsUsd >= 0 ? '+' : '−'}${Math.round(Math.abs(totalSavingsUsd)).toLocaleString()}
              </span>
            </div>
          </div>

          {/* ▶ 이번 달 현금흐름 */}
          <div className={`rounded-2xl p-4 border ${netUsd >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
            <p className={`text-xs font-semibold ${netUsd >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>이번 달 순현금흐름</p>
            <p className={`text-3xl font-bold mt-1 ${netUsd >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
              {netUsd >= 0 ? '+' : '−'}${Math.round(Math.abs(netUsd)).toLocaleString()}
            </p>
            <div className="flex gap-4 mt-2 text-xs">
              <span className="text-emerald-700">📈 수입 ${Math.round(incomeUsd).toLocaleString()}</span>
              <span className="text-rose-700">📉 지출 ${Math.round(expenseUsd).toLocaleString()}</span>
            </div>
          </div>

          {/* ▶ 6개월 흐름 */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">6개월 흐름</p>
            <MonthlyChart data={last6Data} />
          </div>

          {/* ▶ 업적 배지 */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-800">업적 배지</p>
              <span className="text-xs text-gray-400">{achievements.filter(a => a.unlocked).length}/{achievements.length} 달성</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {achievements.map(a => (
                <div key={a.name}
                  className={`rounded-xl p-2.5 text-center transition-all ${a.unlocked ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50 border border-gray-100 grayscale opacity-40'}`}>
                  <div className="text-2xl mb-1">{a.icon}</div>
                  <p className="text-[11px] font-semibold text-gray-800 leading-tight">{a.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{a.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ▶ 카테고리 도넛 */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">카테고리별 지출</p>
            {sortedCats.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">이번 달 지출 내역이 없어요</p>
            ) : (
              <DonutChart data={sortedCats} total={expenseUsd} />
            )}
          </div>

          {/* ▶ 일별 지출 추이 */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">일별 지출 추이</p>
            <DailyBarChart data={dailyExpenses} today={now.getDate()} />
          </div>
        </div>
      )}

      {/* ── 수입 탭 ── */}
      {subTab === 'income' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">수입 기록 · <span className="text-gray-400 font-normal">Ghi thu nhập</span></h3>
            {inErrMsg && <p className="text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-700">{inErrMsg}</p>}
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
              <div className="flex gap-1.5">
                <label className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${ocrLoading ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                  {ocrLoading ? '...' : '📷 촬영'}
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                    className="hidden" disabled={ocrLoading} onChange={handleReceiptUpload} />
                </label>
                <label className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${ocrLoading ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                  {ocrLoading ? '...' : '🖼️ 업로드'}
                  <input ref={galleryRef} type="file" accept="image/*"
                    className="hidden" disabled={ocrLoading} onChange={handleReceiptUpload} />
                </label>
              </div>
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

          {Object.keys(expenseTotal).length > 0 && (() => {
            const totalUsd = Object.entries(expenseTotal).reduce((s, [cur, amt]) => {
              if (cur === 'VND') return s + amt / usdToVnd;
              if (cur === 'KRW') return s + amt / usdToKrw;
              return s + amt;
            }, 0);
            const allCats: Record<string, number> = {};
            for (const [cur, cats] of Object.entries(expenseByCategory)) {
              for (const [cat, amt] of Object.entries(cats)) {
                let usd = amt;
                if (cur === 'VND') usd = amt / usdToVnd;
                else if (cur === 'KRW') usd = amt / usdToKrw;
                allCats[cat] = (allCats[cat] ?? 0) + usd;
              }
            }
            return (
              <div className="bg-rose-50 rounded-xl p-3 border border-rose-100 space-y-2">
                <p className="text-xs font-semibold text-rose-700">{periodLabel[exPeriod]} 총 지출</p>
                <p className="text-xl font-bold text-rose-800">${Math.round(totalUsd).toLocaleString()}</p>
                <div className="flex gap-3">
                  <p className="text-xs text-rose-400">₫{Math.round(totalUsd * usdToVnd).toLocaleString()}</p>
                  <p className="text-xs text-rose-400">₩{Math.round(totalUsd * usdToKrw).toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {Object.entries(allCats).sort((a, b) => b[1] - a[1]).map(([cat, usd]) => (
                    <div key={cat} className="flex justify-between bg-white/60 rounded-lg px-2 py-1">
                      <span className="text-xs text-gray-600">{cat}</span>
                      <span className="text-xs font-medium text-rose-700">${Math.round(usd).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {filteredExpenses.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm"><p className="text-2xl mb-2">📉</p><p>지출 내역이 없어요</p></div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {filteredExpenses.map(item => (
                  <li key={item.id}>
                    {/* 일반 행 */}
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs bg-rose-100 text-rose-700 font-medium px-2 py-0.5 rounded-full">{item.category}</span>
                          {item.merchant && <span className="text-xs text-gray-700 font-medium truncate">{item.merchant}</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{item.date}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-sm font-bold text-rose-700">{fmt(item.amount, item.currency)}</span>
                        <button onClick={() => editingId === item.id ? setEditingId(null) : startEdit(item)}
                          className={`p-1 transition-colors text-sm ${editingId === item.id ? 'text-indigo-500' : 'text-gray-300 hover:text-indigo-400'}`}>✏️</button>
                        <button onClick={() => handleDeleteExpense(item.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1 text-sm">✕</button>
                      </div>
                    </div>
                    {/* 인라인 수정 패널 */}
                    {editingId === item.id && (
                      <div className="px-4 pb-3 bg-indigo-50/60 border-t border-indigo-100 space-y-2">
                        <div className="flex gap-2 pt-2">
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 mb-1">카테고리</p>
                            <select value={editFields.category} onChange={e => setEditFields(f => ({ ...f, category: e.target.value }))} className={`${selectCls} w-full`}>
                              {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 mb-1">날짜</p>
                            <input type="date" value={editFields.date} onChange={e => setEditFields(f => ({ ...f, date: e.target.value }))} className={inputCls} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 mb-1">금액</p>
                            <input type="text" inputMode="numeric" value={editFields.amount}
                              onChange={e => setEditFields(f => ({ ...f, amount: e.target.value.replace(/[^0-9]/g, '') }))} className={inputCls} />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">통화</p>
                            <select value={editFields.currency} onChange={e => setEditFields(f => ({ ...f, currency: e.target.value }))} className={selectCls}>
                              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">상호명</p>
                          <input type="text" value={editFields.merchant} onChange={e => setEditFields(f => ({ ...f, merchant: e.target.value }))} className={inputCls} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingId(null)} className="flex-1 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-600">취소</button>
                          <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white disabled:opacity-50">
                            {editSaving ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                    )}
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
