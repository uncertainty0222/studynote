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
type Period = 'month' | 'lastmonth' | 'lastlastmonth' | 'year';

const INCOME_CATEGORIES = ['TOUR', 'COIN', '기타'];
const EXPENSE_CATEGORIES = ['외식', '생활비', '교통', '쇼핑', '주거', '의료', '카페', '구독', '육아', '통신비', '기타'];
const CURRENCIES = ['VND', 'KRW', 'USD', 'USDT'];

const INCOME_CATEGORY_VI: Record<string, string> = {
  'TOUR': 'Tour', 'COIN': 'Coin / Đầu tư', '기타': 'Khác',
  '투어': 'Tour', '투자수익': 'Đầu tư', '급여': 'Lương', '부업': 'Việc phụ', '보너스': 'Thưởng',
};
const EXPENSE_CATEGORY_VI: Record<string, string> = {
  '외식': 'Ăn ngoài', '생활비': 'Sinh hoạt', '교통': 'Giao thông',
  '쇼핑': 'Mua sắm', '주거': 'Nhà ở', '의료': 'Y tế',
  '카페': 'Cà phê', '구독': 'Đăng ký', '육아': 'Nuôi con', '통신비': 'Viễn thông', '기타': 'Khác',
};

const CATEGORY_COLORS: Record<string, string> = {
  '외식': '#f87171', '생활비': '#fb923c', '교통': '#facc15', '쇼핑': '#f472b6',
  '주거': '#fbbf24', '의료': '#34d399', '카페': '#22d3ee', '구독': '#a78bfa',
  '육아': '#60a5fa', '통신비': '#2dd4bf', '기타': '#94a3b8',
};

function toUsd(amount: number, currency: string, usdToVnd: number, usdToKrw: number): number {
  if (currency === 'VND') return amount / usdToVnd;
  if (currency === 'KRW') return amount / usdToKrw;
  return amount;
}

const LEVEL_TITLES = ['', '새내기 🌱', '절약 견습생 🐣', '가계부 마스터 📒', '자산 수호자 🛡️', '현금흐름 왕 👑', '전설의 재테크러 🌟'];
const LEVEL_TITLES_VI = ['', 'Tân binh', 'Tập sự tiết kiệm', 'Bậc thầy chi tiêu', 'Người gác tài sản', 'Vua dòng tiền', 'Huyền thoại tài chính'];
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
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 flex-shrink-0 inline-block"></span>
          수입 <span className="text-gray-400">/ Thu</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 flex-shrink-0 inline-block"></span>
          지출 <span className="text-gray-400">/ Chi</span>
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

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
    else if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += ch;
  }
  result.push(current);
  return result;
}

interface ParsedCsvEntry { date: string; amount: number; currency: string; category: string; description: string; }

function parseIncomeCsv(text: string): { entries: ParsedCsvEntry[]; errors: string[] } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { entries: [], errors: ['빈 CSV'] };
  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const dateI = header.indexOf('date'), amountI = header.indexOf('amount');
  const curI = header.indexOf('currency'), catI = header.indexOf('category'), descI = header.indexOf('description');
  if (dateI < 0 || amountI < 0 || catI < 0) {
    return { entries: [], errors: ['헤더에 date, amount, category가 모두 있어야 합니다'] };
  }
  const entries: ParsedCsvEntry[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, i) => {
    const f = parseCsvLine(line);
    const date = f[dateI]?.trim();
    const amount = Number(f[amountI]?.trim());
    const category = f[catI]?.trim();
    if (!date || Number.isNaN(amount) || !category) {
      errors.push(`row ${i + 2}: 필수 항목 누락`);
      return;
    }
    entries.push({
      date, amount,
      currency: (curI >= 0 ? f[curI]?.trim() : '') || 'USD',
      category,
      description: (descI >= 0 ? f[descI]?.trim() : '') || '',
    });
  });
  return { entries, errors };
}

function dateSectionLabel(dateStr: string): string {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const dayB = new Date(now); dayB.setDate(now.getDate() - 2);
  if (dateStr === todayStr) return '오늘 · Hôm nay';
  if (dateStr === yest.toISOString().slice(0, 10)) return '어제 · Hôm qua';
  if (dateStr === dayB.toISOString().slice(0, 10)) return '그저께 · Hôm kia';
  return dateStr.slice(5).replace('-', '/');
}

function filterByPeriod<T extends { date: string }>(items: T[], period: Period): T[] {
  const now = new Date();
  return items.filter(i => {
    const d = new Date(i.date);
    if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (period === 'lastmonth') {
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getFullYear() === last.getFullYear() && d.getMonth() === last.getMonth();
    }
    if (period === 'lastlastmonth') {
      const ll = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return d.getFullYear() === ll.getFullYear() && d.getMonth() === ll.getMonth();
    }
    return d.getFullYear() === now.getFullYear();
  });
}

const periodLabel: Record<Period, string> = { month: '이번 달', lastmonth: '저번 달', lastlastmonth: '저저번 달', year: '올해' };
const periodLabelVI: Record<Period, string> = { month: 'Tháng này', lastmonth: 'Tháng trước', lastlastmonth: '2 tháng trước', year: 'Năm nay' };
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
        <text x={size/2} y={size/2 - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="#111827">${Math.round(total).toLocaleString()}</text>
        <text x={size/2} y={size/2 + 10} textAnchor="middle" fontSize="10" fill="#9ca3af">총 지출</text>
        <text x={size/2} y={size/2 + 22} textAnchor="middle" fontSize="9" fill="#9ca3af" fontStyle="italic">Tổng chi</text>
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

export default function ChongTab({ user }: { user: { role: string } }) {
  const isHusband = user.role === 'husband';
  const [subTab, setSubTab] = useState<SubTab>('dashboard');
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [inFormOpen, setInFormOpen] = useState(false);
  const [exFormOpen, setExFormOpen] = useState(false);
  const [dashIncomeExpanded, setDashIncomeExpanded] = useState(false);
  const [dashExpenseExpanded, setDashExpenseExpanded] = useState(false);

  // Income
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [inPeriod, setInPeriod] = useState<Period>('month');
  const [inAmount, setInAmount] = useState('');
  const [inCurrency, setInCurrency] = useState('VND');
  const [inCategory, setInCategory] = useState('TOUR');
  const [inDesc, setInDesc] = useState('');
  const [inDate, setInDate] = useState(new Date().toISOString().slice(0, 10));
  const [inSubmitting, setInSubmitting] = useState(false);

  // Expense
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [exPeriod, setExPeriod] = useState<Period>('month');
  const [exViewMode, setExViewMode] = useState<'category' | 'date'>('category');
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

  // CSV bulk upload
  const [csvText, setCsvText] = useState('');
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvMsg, setCsvMsg] = useState('');
  const csvFileRef = useRef<HTMLInputElement>(null);
  const csvParsed = csvText ? parseIncomeCsv(csvText) : null;

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setCsvMsg('');
  }

  async function handleCsvImport() {
    if (!csvParsed || csvParsed.entries.length === 0) return;
    setCsvUploading(true); setCsvMsg('');
    try {
      const res = await fetch('/api/personal/income/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: csvParsed.entries }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCsvMsg(`⚠️ 업로드 실패: ${err.error ?? res.status}`);
      } else {
        const d = await res.json();
        setCsvMsg(`✅ ${d.inserted}건 업로드 완료${d.errors.length > 0 ? ` (오류 ${d.errors.length}건)` : ''}`);
        setCsvText('');
        if (csvFileRef.current) csvFileRef.current.value = '';
        await fetchIncomes();
      }
    } catch {
      setCsvMsg('⚠️ 네트워크 오류');
    }
    setCsvUploading(false);
  }

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
      setInFormOpen(false);
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
      setExFormOpen(false);
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

  const isTourCat = (cat: string) => {
    const c = cat.trim();
    return c === 'TOUR' || c === '투어' || c.startsWith('TOUR') || c.startsWith('투어');
  };
  const isCoinCat = (cat: string) => {
    const c = cat.trim();
    return c === 'COIN' || c === '투자수익' || c.startsWith('COIN') || c.startsWith('투자수익');
  };

  const tourIncomeUsd = monthIncomes
    .filter(i => isTourCat(i.category))
    .reduce((s, i) => s + toUsd(Number(i.amount), i.currency, usdToVnd, usdToKrw), 0);
  const investIncomeUsd = monthIncomes
    .filter(i => isCoinCat(i.category))
    .reduce((s, i) => s + toUsd(Number(i.amount), i.currency, usdToVnd, usdToKrw), 0);
  const otherIncomeUsd = incomeUsd - tourIncomeUsd - investIncomeUsd;

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
    const inc = found?.income ?? 0;
    const exp = found?.expense ?? 0;
    const monthIncomes = incomes.filter(i => i.date.startsWith(key));
    const tourInc = monthIncomes.filter(i => isTourCat(i.category))
      .reduce((s, i) => s + toUsd(Number(i.amount), i.currency, usdToVnd, usdToKrw), 0);
    const coinInc = monthIncomes.filter(i => isCoinCat(i.category))
      .reduce((s, i) => s + toUsd(Number(i.amount), i.currency, usdToVnd, usdToKrw), 0);
    const otherInc = inc - tourInc - coinInc;
    const expByCat: Record<string, number> = {};
    for (const e of expenses.filter(e => e.date.startsWith(key))) {
      const usd = toUsd(Number(e.amount), e.currency, usdToVnd, usdToKrw);
      expByCat[e.category] = (expByCat[e.category] ?? 0) + usd;
    }
    const sortedExpCats = Object.entries(expByCat).sort((a, b) => b[1] - a[1]);
    return { key, income: inc, expense: exp, net: inc - exp, tourInc, coinInc, otherInc, sortedExpCats };
  });

  const incomePower  = Math.min(Math.round((incomeUsd / 500) * 100), 100);
  const selfControl  = incomeUsd > 0 ? Math.max(0, Math.round((1 - expenseUsd / incomeUsd) * 100)) : 0;
  const streakScore  = Math.min(consecutivePositive * 25, 100);

  const achievements = [
    { icon: '🌟', name: '첫 수입',    nameVi: 'Lần đầu thu',   desc: '수입 기록 시작',         descVi: 'Bắt đầu ghi thu',    unlocked: incomes.length > 0 },
    { icon: '💰', name: '첫 흑자',    nameVi: 'Thặng dư đầu', desc: '한 달 흑자 달성',        descVi: 'Tháng thặng dư đầu', unlocked: positiveMonths >= 1 },
    { icon: '🔥', name: '연속 흑자',  nameVi: 'Chuỗi thặng dư', desc: '2달 이상 연속 흑자',  descVi: '2+ tháng liên tiếp', unlocked: consecutivePositive >= 2 },
    { icon: '🛡️', name: '절약왕',    nameVi: 'Vua tiết kiệm', desc: '지출이 수입의 50% 이하', descVi: 'Chi ≤ 50% thu',     unlocked: incomeUsd > 0 && expenseUsd <= incomeUsd * 0.5 },
    { icon: '💎', name: '수입 $500', nameVi: 'Thu $500',      desc: '한 달 수입 $500 돌파',   descVi: 'Tháng > $500',       unlocked: incomeUsd >= 500 },
    { icon: '🏆', name: '3달 연속',   nameVi: '3 tháng',       desc: '3개월 연속 흑자 달성',   descVi: '3 tháng liên tiếp',  unlocked: consecutivePositive >= 3 },
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
      {isHusband && (
        <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
          <button onClick={() => setSubTab('dashboard')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${subTab === 'dashboard' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}>
            📊 대시보드
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
      )}

      {/* ── 대시보드 ── */}
      {subTab === 'dashboard' && (
        <div className="space-y-3">

          {/* ▶ 이번달 현금흐름 종합 */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

            {/* 순현금흐름 헤더 */}
            <div className={`px-4 pt-4 pb-3 ${netUsd >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <p className={`text-xs font-semibold ${netUsd >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                이번 달 순현금흐름 · <span className="font-normal">Dòng tiền tháng này</span>
              </p>
              <p className={`text-4xl font-bold mt-1 tracking-tight ${netUsd >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                {netUsd >= 0 ? '+' : '−'}${Math.round(Math.abs(netUsd)).toLocaleString()}
              </p>
              <p className={`text-sm mt-0.5 ${netUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ({netUsd >= 0 ? '+' : '−'}₫{Math.round(Math.abs(netUsd) * usdToVnd).toLocaleString()})
              </p>
            </div>

            {/* 수입 섹션 */}
            <div className="border-b border-gray-100">
              <button
                onClick={() => setDashIncomeExpanded(v => !v)}
                className="w-full px-4 pt-3.5 pb-0 text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700">📈 수입 · Thu nhập</span>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <span className="text-lg font-bold text-emerald-700">${Math.round(incomeUsd).toLocaleString()}</span>
                      <span className="text-sm text-emerald-400 ml-1">(₫{Math.round(incomeUsd * usdToVnd).toLocaleString()})</span>
                    </div>
                    <span className="text-gray-300 text-xs">{dashIncomeExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
              </button>
              <div className="px-4 pb-3.5 space-y-2.5">
                {tourIncomeUsd !== 0 && (() => {
                  const pct = Math.round(tourIncomeUsd / incomeUsd * 100);
                  return (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-teal-700">🗺️ TOUR</span>
                        <div className="text-right">
                          <span className="text-teal-700">${Math.round(tourIncomeUsd).toLocaleString()} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                          <span className="block text-xs text-teal-400">₫{Math.round(tourIncomeUsd * usdToVnd).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                {investIncomeUsd !== 0 && (() => {
                  const pct = Math.round(investIncomeUsd / incomeUsd * 100);
                  return (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-blue-700">🪙 COIN</span>
                        <div className="text-right">
                          <span className="text-blue-700">${Math.round(investIncomeUsd).toLocaleString()} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                          <span className="block text-xs text-blue-400">₫{Math.round(investIncomeUsd * usdToVnd).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                {Math.abs(otherIncomeUsd) >= 1 && (() => {
                  const pct = Math.round(Math.abs(otherIncomeUsd) / incomeUsd * 100);
                  return (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">기타 · Khác</span>
                        <div className="text-right">
                          <span className="text-gray-500">${Math.round(otherIncomeUsd).toLocaleString()} <span className="text-gray-400">({pct}%)</span></span>
                          <span className="block text-xs text-gray-400">₫{Math.round(otherIncomeUsd * usdToVnd).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-300 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* 수입 개별 항목 (수입탭과 동일 레이아웃) */}
              {dashIncomeExpanded && (
                <div className="border-t border-gray-100 bg-gray-50/60 p-3 space-y-2">
                  {(() => {
                    const tourItems = monthIncomes.filter(i => isTourCat(i.category));
                    const investItems = monthIncomes.filter(i => isCoinCat(i.category));
                    const otherItems = monthIncomes.filter(i => !isTourCat(i.category) && !isCoinCat(i.category));

                    const renderItem = (item: IncomeEntry) => {
                      const amt = Number(item.amount);
                      const neg = amt < 0;
                      const abs = Math.abs(Math.round(amt));
                      const color = neg ? 'text-rose-600' : 'text-emerald-700';
                      const smallColor = neg ? 'text-rose-400' : 'text-emerald-400';
                      const sign = neg ? '−' : '';
                      let primary = '';
                      let vndAmt: number | null = null;
                      if (item.currency === 'USD' || item.currency === 'USDT') {
                        primary = `${sign}$${abs.toLocaleString()}`;
                        vndAmt = Math.round(Math.abs(amt) * usdToVnd);
                      } else if (item.currency === 'KRW') {
                        primary = `${sign}₩${abs.toLocaleString()}`;
                        vndAmt = Math.round(Math.abs(amt) / usdToKrw * usdToVnd);
                      } else {
                        primary = `${sign}₫${abs.toLocaleString()}`;
                      }
                      return (
                        <li key={item.id} className="py-2 px-2.5 flex items-start justify-between gap-1 border-b border-gray-50 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-gray-700 font-medium truncate">{item.description || item.category}</p>
                            <p className="text-[10px] text-gray-400">{item.date.slice(5)}</p>
                          </div>
                          <div className="text-right flex-shrink-0 flex items-center gap-1">
                            <div>
                              <span className={`text-xs font-bold ${color}`}>{primary}</span>
                              {vndAmt !== null && (
                                <span className={`block text-[9px] ${smallColor}`}>{sign}₫{vndAmt.toLocaleString()}</span>
                              )}
                            </div>
                            {isHusband && (
                              <button onClick={() => handleDeleteIncome(item.id)} className="text-gray-200 hover:text-red-400 transition-colors ml-0.5">✕</button>
                            )}
                          </div>
                        </li>
                      );
                    };

                    if (monthIncomes.length === 0) {
                      return (
                        <div className="bg-white rounded-2xl shadow-sm py-6 text-center text-gray-400 text-sm">
                          <p className="text-2xl mb-1">📈</p>
                          <p>이번 달 수입 없음</p>
                          <p className="text-[11px] mt-0.5">Chưa có thu nhập tháng này</p>
                        </div>
                      );
                    }
                    return (
                      <>
                        {(tourItems.length > 0 || investItems.length > 0) && (
                          <div className="grid grid-cols-2 gap-2">
                            {tourItems.length > 0 && (
                              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                                <p className="text-[11px] font-semibold text-teal-700 px-2.5 pt-2.5 pb-1">🗺️ 투어 · <span className="font-normal text-teal-500">Tour</span></p>
                                <ul>{tourItems.map(renderItem)}</ul>
                              </div>
                            )}
                            {investItems.length > 0 && (
                              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                                <p className="text-[11px] font-semibold text-blue-700 px-2.5 pt-2.5 pb-1">📊 투자수익 · <span className="font-normal text-blue-500">Đầu tư</span></p>
                                <ul>{investItems.map(renderItem)}</ul>
                              </div>
                            )}
                          </div>
                        )}
                        {otherItems.length > 0 && (
                          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                            <p className="text-[11px] font-semibold text-gray-500 px-3 pt-2.5 pb-1">기타 수입 · <span className="font-normal text-gray-400">Thu khác</span></p>
                            <ul className="divide-y divide-gray-50">
                              {otherItems.map(item => {
                                const amt = Number(item.amount);
                                const neg = amt < 0;
                                const abs = Math.abs(Math.round(amt));
                                const color = neg ? 'text-rose-600' : 'text-emerald-700';
                                const smallColor = neg ? 'text-rose-400' : 'text-emerald-400';
                                const sign = neg ? '−' : '';
                                let primary = '';
                                let vndAmt: number | null = null;
                                if (item.currency === 'USD' || item.currency === 'USDT') {
                                  primary = `${sign}$${abs.toLocaleString()}`; vndAmt = Math.round(Math.abs(amt) * usdToVnd);
                                } else if (item.currency === 'KRW') {
                                  primary = `${sign}₩${abs.toLocaleString()}`; vndAmt = Math.round(Math.abs(amt) / usdToKrw * usdToVnd);
                                } else {
                                  primary = `${sign}₫${abs.toLocaleString()}`;
                                }
                                return (
                                  <li key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">{item.category}</span>
                                        {item.description && <span className="text-xs text-gray-500 truncate">{item.description}</span>}
                                      </div>
                                      <p className="text-xs text-gray-400 mt-0.5">{item.date}</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <div className="text-right">
                                        <span className={`text-sm font-bold ${color}`}>{primary}</span>
                                        {vndAmt !== null && <span className={`block text-[10px] ${smallColor}`}>{sign}₫{vndAmt.toLocaleString()}</span>}
                                      </div>
                                      {isHusband && (
                                        <button onClick={() => handleDeleteIncome(item.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1">✕</button>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* 지출 섹션 */}
            <div>
              <button
                onClick={() => setDashExpenseExpanded(v => !v)}
                className="w-full px-4 pt-3.5 pb-0 text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700">📉 지출 · Chi tiêu</span>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <span className="text-lg font-bold text-rose-700">${Math.round(expenseUsd).toLocaleString()}</span>
                      <span className="text-sm text-rose-400 ml-1">(₫{Math.round(expenseUsd * usdToVnd).toLocaleString()})</span>
                    </div>
                    <span className="text-gray-300 text-xs">{dashExpenseExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
              </button>
              <div className="px-4 pb-5">
                {sortedCats.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">이번 달 지출 없음 · Chưa có chi tiêu</p>
                ) : (
                  <div className="space-y-2.5">
                    {sortedCats.map(([cat, usd]) => {
                      const pct = Math.round(usd / expenseUsd * 100);
                      const color = CATEGORY_COLORS[cat] ?? '#94a3b8';
                      const catVi = EXPENSE_CATEGORY_VI[cat] ?? cat;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-700">{cat} <span className="text-gray-400 font-normal text-xs">· {catVi}</span></span>
                            <div className="text-right">
                              <span className="text-gray-600">${Math.round(usd).toLocaleString()} <span className="text-gray-400">({pct}%)</span></span>
                              <span className="block text-xs text-gray-400">₫{Math.round(usd * usdToVnd).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* 지출 개별 항목 (지출탭과 동일 레이아웃) */}
              {dashExpenseExpanded && (
                <div className="border-t border-gray-100 bg-gray-50/60 p-3 space-y-3">
                  {(() => {
                    const grouped: Record<string, ExpenseEntry[]> = {};
                    for (const item of monthExpenses) {
                      if (!grouped[item.category]) grouped[item.category] = [];
                      grouped[item.category].push(item);
                    }
                    const sortedGroupedCats = Object.entries(grouped).sort((a, b) => {
                      const sum = (items: ExpenseEntry[]) => items.reduce((s, it) => {
                        const n = Number(it.amount);
                        if (it.currency === 'VND') return s + n / usdToVnd;
                        if (it.currency === 'KRW') return s + n / usdToKrw;
                        return s + n;
                      }, 0);
                      return sum(b[1]) - sum(a[1]);
                    });

                    if (monthExpenses.length === 0) {
                      return (
                        <div className="bg-white rounded-2xl shadow-sm py-6 text-center text-gray-400 text-sm">
                          <p className="text-2xl mb-1">📉</p>
                          <p>이번 달 지출 없음</p>
                          <p className="text-[11px] mt-0.5">Chưa có chi tiêu tháng này</p>
                        </div>
                      );
                    }

                    return sortedGroupedCats.map(([cat, items]) => {
                      const catUsd = items.reduce((s, it) => {
                        const n = Number(it.amount);
                        if (it.currency === 'VND') return s + n / usdToVnd;
                        if (it.currency === 'KRW') return s + n / usdToKrw;
                        return s + n;
                      }, 0);
                      return (
                        <div key={cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                          <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
                            <span className="text-xs font-semibold text-rose-700">{cat} · <span className="font-normal text-rose-400">{EXPENSE_CATEGORY_VI[cat] ?? cat}</span></span>
                            <span className="text-xs font-bold text-rose-800">
                              ${Math.round(catUsd).toLocaleString()}
                              <span className="font-medium text-rose-400 ml-1">(₫{Math.round(catUsd * usdToVnd).toLocaleString()})</span>
                            </span>
                          </div>
                          <ul className="divide-y divide-gray-50">
                            {items.map(item => {
                              const n = Number(item.amount);
                              const itemUsd = item.currency === 'VND' ? n / usdToVnd : item.currency === 'KRW' ? n / usdToKrw : n;
                              return (
                                <li key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    {item.merchant && <p className="text-xs text-gray-700 font-medium truncate">{item.merchant}</p>}
                                    <p className="text-xs text-gray-400 mt-0.5">{item.date}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <div className="text-right">
                                      {item.currency === 'VND' ? (
                                        <>
                                          <p className="text-sm font-bold text-rose-700">₫{Math.round(n).toLocaleString()}</p>
                                          <p className="text-xs text-rose-400">${(n / usdToVnd).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                                        </>
                                      ) : item.currency === 'KRW' ? (
                                        <>
                                          <p className="text-sm font-bold text-rose-700">₩{Math.round(n).toLocaleString()}</p>
                                          <p className="text-xs text-rose-400">₫{Math.round(itemUsd * usdToVnd).toLocaleString()}</p>
                                        </>
                                      ) : (
                                        <>
                                          <p className="text-sm font-bold text-rose-700">${Math.round(n).toLocaleString()}</p>
                                          <p className="text-xs text-rose-400">₫{Math.round(itemUsd * usdToVnd).toLocaleString()}</p>
                                        </>
                                      )}
                                    </div>
                                    {isHusband && (
                                      <button onClick={() => handleDeleteExpense(item.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1 text-sm">✕</button>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* ▶ 최근 3달 순현금흐름 */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <p className="text-sm font-semibold text-gray-800 px-4 pt-4 pb-3">
              최근 3달 순현금흐름 <span className="text-gray-400 font-normal">· 3 tháng gần đây</span>
            </p>
            <div className="divide-y divide-gray-50">
              {last6Data.slice(-3).map(d => {
                const isPos = d.net >= 0;
                const monthLabel = `${parseInt(d.key.slice(5))}월`;
                const isCurrent = d.key === now.toISOString().slice(0, 7);
                const isExpanded = expandedMonth === d.key;
                return (
                  <div key={d.key}>
                    {/* 요약 행 (클릭 가능) */}
                    <button
                      onClick={() => setExpandedMonth(isExpanded ? null : d.key)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${isCurrent ? 'bg-indigo-50' : 'bg-white hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${isCurrent ? 'text-indigo-700' : 'text-gray-700'}`}>
                          {monthLabel}
                        </span>
                        {isCurrent && <span className="text-[10px] text-indigo-400 bg-indigo-100 px-1.5 py-0.5 rounded-full">이번 달</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className={`text-sm font-bold ${isPos ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {isPos ? '+' : '−'}${Math.round(Math.abs(d.net)).toLocaleString()}
                          </span>
                          <span className={`block text-[10px] ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPos ? '+' : '−'}₫{Math.round(Math.abs(d.net) * usdToVnd).toLocaleString()}
                          </span>
                        </div>
                        <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* 펼침 상세 */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50/50">
                        {/* 수입 */}
                        <div className="px-4 pt-3 pb-3 border-b border-gray-100">
                          <div className="flex items-baseline justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-700">📈 수입</span>
                            <div className="text-right">
                              <span className="text-sm font-bold text-emerald-700">${Math.round(d.income).toLocaleString()}</span>
                              <span className="text-xs text-emerald-400 ml-1">(₫{Math.round(d.income * usdToVnd).toLocaleString()})</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {d.tourInc !== 0 && (() => {
                              const pct = Math.round(d.tourInc / d.income * 100);
                              return (
                                <div>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="font-medium text-teal-700">🗺️ TOUR</span>
                                    <span className="text-teal-700">${Math.round(d.tourInc).toLocaleString()} <span className="text-gray-400">({pct}%)</span></span>
                                  </div>
                                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-teal-400 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })()}
                            {d.coinInc !== 0 && (() => {
                              const pct = Math.round(d.coinInc / d.income * 100);
                              return (
                                <div>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="font-medium text-blue-700">🪙 COIN</span>
                                    <span className="text-blue-700">${Math.round(d.coinInc).toLocaleString()} <span className="text-gray-400">({pct}%)</span></span>
                                  </div>
                                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })()}
                            {Math.abs(d.otherInc) >= 1 && (() => {
                              const pct = Math.round(Math.abs(d.otherInc) / d.income * 100);
                              return (
                                <div>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-500">기타</span>
                                    <span className="text-gray-500">${Math.round(d.otherInc).toLocaleString()} <span className="text-gray-400">({pct}%)</span></span>
                                  </div>
                                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-gray-300 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        {/* 지출 */}
                        <div className="px-4 pt-3 pb-4">
                          <div className="flex items-baseline justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-700">📉 지출</span>
                            <div className="text-right">
                              <span className="text-sm font-bold text-rose-700">${Math.round(d.expense).toLocaleString()}</span>
                              <span className="text-xs text-rose-400 ml-1">(₫{Math.round(d.expense * usdToVnd).toLocaleString()})</span>
                            </div>
                          </div>
                          {d.sortedExpCats.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-1">지출 없음</p>
                          ) : (
                            <div className="space-y-2">
                              {d.sortedExpCats.map(([cat, usd]) => {
                                const pct = Math.round(usd / d.expense * 100);
                                const color = CATEGORY_COLORS[cat] ?? '#94a3b8';
                                return (
                                  <div key={cat}>
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="text-gray-700">{cat}</span>
                                      <span className="text-gray-600">${Math.round(usd).toLocaleString()} <span className="text-gray-400">({pct}%)</span></span>
                                    </div>
                                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 수입 탭 ── */}
      {isHusband && subTab === 'income' && (
        <div className="space-y-3">

          {/* 입력하기 토글 버튼 */}
          <button onClick={() => setInFormOpen(v => !v)}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${inFormOpen ? 'bg-gray-100 text-gray-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
            {inFormOpen ? '✕ 닫기 · Đóng' : '+ 입력하기 · Thêm thu nhập'}
          </button>

          {/* 입력 폼 (토글) */}
          {inFormOpen && (
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              {inErrMsg && <p className="text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-700">{inErrMsg}</p>}
              <form onSubmit={handleAddIncome} className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>금액 · <span className="font-normal text-gray-400">Số tiền</span></label>
                    <input type="text" inputMode="numeric" value={inAmount}
                      onChange={e => setInAmount(e.target.value.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, ''))}
                      placeholder="0 또는 -100" required className={inputCls} autoFocus />
                    {(inCurrency === 'USD' || inCurrency === 'USDT') && inAmount && !Number.isNaN(Number(inAmount)) && Number(inAmount) !== 0 && (
                      <p className="text-xs text-gray-400 mt-1 ml-0.5">≈ ₫{Math.round(Number(inAmount) * usdToVnd).toLocaleString()}</p>
                    )}
                    {inCurrency === 'KRW' && inAmount && !Number.isNaN(Number(inAmount)) && Number(inAmount) !== 0 && (
                      <p className="text-xs text-gray-400 mt-1 ml-0.5">≈ ₫{Math.round(Number(inAmount) / usdToKrw * usdToVnd).toLocaleString()}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>통화 · <span className="font-normal text-gray-400">Tiền tệ</span></label>
                    <select value={inCurrency} onChange={e => setInCurrency(e.target.value)} className={selectCls}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>카테고리 · <span className="font-normal text-gray-400">Danh mục</span></label>
                    <select value={inCategory} onChange={e => setInCategory(e.target.value)} className={`${selectCls} w-full`}>
                      {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{INCOME_CATEGORY_VI[c] ? `${c} · ${INCOME_CATEGORY_VI[c]}` : c}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>날짜 · <span className="font-normal text-gray-400">Ngày</span></label>
                    <input type="date" value={inDate} onChange={e => setInDate(e.target.value)} required className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>메모 (선택) · <span className="font-normal text-gray-400">Ghi chú</span></label>
                  <input type="text" value={inDesc} onChange={e => setInDesc(e.target.value)} placeholder="급여, 프리랜서 등" className={inputCls} />
                </div>
                <button type="submit" disabled={inSubmitting || !inAmount.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
                  {inSubmitting ? '저장 중... · Đang lưu...' : '수입 저장 · Lưu thu nhập'}
                </button>
              </form>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-gray-500 font-medium">기간 · <span className="font-normal text-gray-400">Thời gian</span>:</span>
            {(['month', 'lastmonth', 'lastlastmonth', 'year'] as Period[]).map(p => (
              <button key={p} onClick={() => setInPeriod(p)}
                className={`text-center px-2.5 py-1 rounded-full font-medium transition-colors ${inPeriod === p ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                <span className="block text-[11px] leading-tight">{periodLabel[p]}</span>
                <span className="block text-[9px] leading-tight opacity-75">{periodLabelVI[p]}</span>
              </button>
            ))}
          </div>

          {Object.keys(incomeTotal).length > 0 && (
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
              <p className="text-xs font-semibold text-emerald-700 mb-1">{periodLabel[inPeriod]} 총 수입 · <span className="font-normal text-emerald-500">Tổng thu nhập</span></p>
              {Object.entries(incomeTotal).map(([cur, amt]) => {
                const r = Math.round(amt);
                let display = '';
                let vnd: number | null = null;
                if (cur === 'USD' || cur === 'USDT') {
                  display = `$${r.toLocaleString()}`;
                  vnd = Math.round(amt * usdToVnd);
                } else if (cur === 'KRW') {
                  display = `₩${r.toLocaleString()}`;
                  vnd = Math.round(amt / usdToKrw * usdToVnd);
                } else {
                  display = `₫${r.toLocaleString()}`;
                }
                return (
                  <p key={cur} className="text-base font-bold text-emerald-800">
                    {display}
                    {vnd !== null && (
                      <span className="text-sm font-normal text-emerald-600 ml-1.5">(₫{vnd.toLocaleString()})</span>
                    )}
                  </p>
                );
              })}
            </div>
          )}

          {(() => {
            const tourItems = filteredIncomes.filter(i => isTourCat(i.category));
            const investItems = filteredIncomes.filter(i => isCoinCat(i.category));
            const otherItems = filteredIncomes.filter(i => !isTourCat(i.category) && !isCoinCat(i.category));

            const renderItem = (item: IncomeEntry) => {
              const amt = Number(item.amount);
              const neg = amt < 0;
              const abs = Math.abs(Math.round(amt));
              const color = neg ? 'text-rose-600' : 'text-emerald-700';
              const smallColor = neg ? 'text-rose-400' : 'text-emerald-400';
              const sign = neg ? '−' : '';
              let primary = '';
              let vndAmt: number | null = null;
              if (item.currency === 'USD' || item.currency === 'USDT') {
                primary = `${sign}$${abs.toLocaleString()}`;
                vndAmt = Math.round(Math.abs(amt) * usdToVnd);
              } else if (item.currency === 'KRW') {
                primary = `${sign}₩${abs.toLocaleString()}`;
                vndAmt = Math.round(Math.abs(amt) / usdToKrw * usdToVnd);
              } else {
                primary = `${sign}₫${abs.toLocaleString()}`;
              }
              return (
                <li key={item.id} className="py-2 px-2.5 flex items-start justify-between gap-1 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-700 font-medium truncate">{item.description || item.category}</p>
                    <p className="text-[10px] text-gray-400">{item.date.slice(5)}</p>
                  </div>
                  <div className="text-right flex-shrink-0 flex items-center gap-1">
                    <div>
                      <span className={`text-xs font-bold ${color}`}>{primary}</span>
                      {vndAmt !== null && (
                        <span className={`block text-[9px] ${smallColor}`}>{sign}₫{vndAmt.toLocaleString()}</span>
                      )}
                    </div>
                    <button onClick={() => handleDeleteIncome(item.id)} className="text-gray-200 hover:text-red-400 transition-colors ml-0.5">✕</button>
                  </div>
                </li>
              );
            };

            if (filteredIncomes.length === 0) {
              return (
                <div className="bg-white rounded-2xl shadow-sm py-10 text-center text-gray-400 text-sm">
                  <p className="text-2xl mb-2">📈</p>
                  <p>수입 내역이 없어요</p>
                  <p className="text-[11px] mt-0.5">Chưa có thu nhập</p>
                </div>
              );
            }
            return (
              <div className="space-y-2">
                {(tourItems.length > 0 || investItems.length > 0) && (
                  <div className="grid grid-cols-2 gap-2">
                    {tourItems.length > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                        <p className="text-[11px] font-semibold text-teal-700 px-2.5 pt-2.5 pb-1">🗺️ 투어 · <span className="font-normal text-teal-500">Tour</span></p>
                        <ul>{tourItems.map(renderItem)}</ul>
                      </div>
                    )}
                    {investItems.length > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                        <p className="text-[11px] font-semibold text-blue-700 px-2.5 pt-2.5 pb-1">📊 투자수익 · <span className="font-normal text-blue-500">Đầu tư</span></p>
                        <ul>{investItems.map(renderItem)}</ul>
                      </div>
                    )}
                  </div>
                )}
                {otherItems.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <p className="text-[11px] font-semibold text-gray-500 px-3 pt-2.5 pb-1">기타 수입 · <span className="font-normal text-gray-400">Thu khác</span></p>
                    <ul className="divide-y divide-gray-50">
                      {otherItems.map(item => {
                        const amt = Number(item.amount);
                        const neg = amt < 0;
                        const abs = Math.abs(Math.round(amt));
                        const color = neg ? 'text-rose-600' : 'text-emerald-700';
                        const smallColor = neg ? 'text-rose-400' : 'text-emerald-400';
                        const sign = neg ? '−' : '';
                        let primary = '';
                        let vndAmt: number | null = null;
                        if (item.currency === 'USD' || item.currency === 'USDT') {
                          primary = `${sign}$${abs.toLocaleString()}`; vndAmt = Math.round(Math.abs(amt) * usdToVnd);
                        } else if (item.currency === 'KRW') {
                          primary = `${sign}₩${abs.toLocaleString()}`; vndAmt = Math.round(Math.abs(amt) / usdToKrw * usdToVnd);
                        } else {
                          primary = `${sign}₫${abs.toLocaleString()}`;
                        }
                        return (
                          <li key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">{item.category}</span>
                                {item.description && <span className="text-xs text-gray-500 truncate">{item.description}</span>}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">{item.date}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="text-right">
                                <span className={`text-sm font-bold ${color}`}>{primary}</span>
                                {vndAmt !== null && <span className={`block text-[10px] ${smallColor}`}>{sign}₫{vndAmt.toLocaleString()}</span>}
                              </div>
                              <button onClick={() => handleDeleteIncome(item.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1">✕</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── 지출 탭 ── */}
      {isHusband && subTab === 'expense' && (
        <div className="space-y-3">

          {/* 입력하기 토글 버튼 + OCR */}
          <div className="flex gap-2">
            <button onClick={() => setExFormOpen(v => !v)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${exFormOpen ? 'bg-gray-100 text-gray-500' : 'bg-rose-600 hover:bg-rose-700 text-white'}`}>
              {exFormOpen ? '✕ 닫기 · Đóng' : '+ 입력하기 · Thêm chi tiêu'}
            </button>
            <label className={`flex items-center gap-1 text-xs font-medium px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${ocrLoading ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
              {ocrLoading ? '...' : '📷'}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                className="hidden" disabled={ocrLoading} onChange={e => { setExFormOpen(true); handleReceiptUpload(e); }} />
            </label>
            <label className={`flex items-center gap-1 text-xs font-medium px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${ocrLoading ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
              {ocrLoading ? '...' : '🖼️'}
              <input ref={galleryRef} type="file" accept="image/*"
                className="hidden" disabled={ocrLoading} onChange={e => { setExFormOpen(true); handleReceiptUpload(e); }} />
            </label>
          </div>

          {/* 입력 폼 (토글) */}
          {exFormOpen && (
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              {ocrMsg && (
                <p className={`text-xs px-3 py-2 rounded-lg ${ocrMsg.includes('가져왔') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{ocrMsg}</p>
              )}
              <form onSubmit={handleAddExpense} className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>금액 · <span className="font-normal text-gray-400">Số tiền</span></label>
                    <input type="text" inputMode="numeric" value={exAmount}
                      onChange={e => setExAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="0" required className={inputCls} autoFocus />
                  </div>
                  <div>
                    <label className={labelCls}>통화 · <span className="font-normal text-gray-400">Tiền tệ</span></label>
                    <select value={exCurrency} onChange={e => setExCurrency(e.target.value)} className={selectCls}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>카테고리 · <span className="font-normal text-gray-400">Danh mục</span></label>
                    <select value={exCategory} onChange={e => setExCategory(e.target.value)} className={`${selectCls} w-full`}>
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_VI[c] ? `${c} · ${EXPENSE_CATEGORY_VI[c]}` : c}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>날짜 · <span className="font-normal text-gray-400">Ngày</span></label>
                    <input type="date" value={exDate} onChange={e => setExDate(e.target.value)} required className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>상호명 (선택) · <span className="font-normal text-gray-400">Tên cửa hàng</span></label>
                  <input type="text" value={exMerchant} onChange={e => setExMerchant(e.target.value)} placeholder="마트, 식당명 등" className={inputCls} />
                </div>
                <button type="submit" disabled={exSubmitting || !exAmount.trim()}
                  className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
                  {exSubmitting ? '저장 중... · Đang lưu...' : '지출 저장 · Lưu chi tiêu'}
                </button>
              </form>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 items-center justify-between">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-gray-500 font-medium">기간 · <span className="font-normal text-gray-400">Thời gian</span>:</span>
              {(['month', 'lastmonth', 'lastlastmonth', 'year'] as Period[]).map(p => (
                <button key={p} onClick={() => setExPeriod(p)}
                  className={`text-center px-2.5 py-1 rounded-full font-medium transition-colors ${exPeriod === p ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  <span className="block text-[11px] leading-tight">{periodLabel[p]}</span>
                  <span className="block text-[9px] leading-tight opacity-75">{periodLabelVI[p]}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setExViewMode(v => v === 'category' ? 'date' : 'category')}
              className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors flex-shrink-0 ${exViewMode === 'date' ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {exViewMode === 'category' ? '📅 날짜별' : '🏷️ 카테고리별'}
            </button>
          </div>

          {(() => {
            const totalUsd = Object.entries(expenseTotal).reduce((s, [cur, amt]) => {
              if (cur === 'VND') return s + amt / usdToVnd;
              if (cur === 'KRW') return s + amt / usdToKrw;
              return s + amt;
            }, 0);

            const summaryCard = filteredExpenses.length > 0 && (
              <div className="bg-rose-50 rounded-xl p-3 border border-rose-100">
                <p className="text-xs font-semibold text-rose-700">{periodLabel[exPeriod]} 총 지출 · <span className="font-normal text-rose-400">Tổng chi tiêu</span></p>
                <p className="text-xl font-bold text-rose-800 mt-1">
                  ${Math.round(totalUsd).toLocaleString()}
                  <span className="text-sm font-medium text-rose-400 ml-2">(₫{Math.round(totalUsd * usdToVnd).toLocaleString()})</span>
                </p>
              </div>
            );

            // ── 날짜별 보기 ──
            if (exViewMode === 'date') {
              if (filteredExpenses.length === 0) {
                return (
                  <div className="py-10 text-center text-gray-400 text-sm bg-white rounded-2xl shadow-sm">
                    <p className="text-2xl mb-2">📉</p>
                    <p>지출 내역이 없어요</p>
                    <p className="text-[11px] mt-0.5">Chưa có chi tiêu</p>
                  </div>
                );
              }
              const byDate: Record<string, typeof filteredExpenses> = {};
              for (const item of filteredExpenses) {
                if (!byDate[item.date]) byDate[item.date] = [];
                byDate[item.date].push(item);
              }
              const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
              const itemUsd = (it: ExpenseEntry) => {
                const n = Number(it.amount);
                if (it.currency === 'VND') return n / usdToVnd;
                if (it.currency === 'KRW') return n / usdToKrw;
                return n;
              };
              return (
                <div className="space-y-3">
                  {summaryCard}
                  {sortedDates.map(date => {
                    const dayUsd = byDate[date].reduce((s, it) => s + itemUsd(it), 0);
                    return (
                      <div key={date} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-700">{dateSectionLabel(date)}</span>
                          <span className="text-xs text-rose-600 font-medium">
                            ${Math.round(dayUsd).toLocaleString()}
                            <span className="text-rose-300 ml-1">(₫{Math.round(dayUsd * usdToVnd).toLocaleString()})</span>
                          </span>
                        </div>
                        <ul className="divide-y divide-gray-50">
                          {byDate[date].map(item => {
                            const n = Number(item.amount);
                            const usd = itemUsd(item);
                            const color = CATEGORY_COLORS[item.category] ?? '#94a3b8';
                            const catVi = EXPENSE_CATEGORY_VI[item.category] ?? item.category;
                            return (
                              <li key={item.id}>
                                <div className="px-4 py-3 flex items-center justify-between gap-3">
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: color }} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-gray-500">{item.category} · {catVi}</p>
                                      {item.merchant && <p className="text-sm text-gray-800 font-medium truncate">{item.merchant}</p>}
                                      {item.description && <p className="text-xs text-gray-400 truncate">{item.description}</p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <div className="text-right">
                                      {item.currency === 'VND' ? (
                                        <>
                                          <p className="text-sm font-bold text-rose-700">₫{Math.round(n).toLocaleString()}</p>
                                          <p className="text-xs text-rose-400">${(n / usdToVnd).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                                        </>
                                      ) : item.currency === 'KRW' ? (
                                        <>
                                          <p className="text-sm font-bold text-rose-700">₩{Math.round(n).toLocaleString()}</p>
                                          <p className="text-xs text-rose-400">₫{Math.round(usd * usdToVnd).toLocaleString()}</p>
                                        </>
                                      ) : (
                                        <>
                                          <p className="text-sm font-bold text-rose-700">${Math.round(n).toLocaleString()}</p>
                                          <p className="text-xs text-rose-400">₫{Math.round(usd * usdToVnd).toLocaleString()}</p>
                                        </>
                                      )}
                                    </div>
                                    <button onClick={() => editingId === item.id ? setEditingId(null) : startEdit(item)}
                                      className={`p-1 transition-colors text-sm ${editingId === item.id ? 'text-indigo-500' : 'text-gray-300 hover:text-indigo-400'}`}>✏️</button>
                                    <button onClick={() => handleDeleteExpense(item.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1 text-sm">✕</button>
                                  </div>
                                </div>
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
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              );
            }

            // ── 카테고리별 보기 ──
            // group filteredExpenses by category
            const grouped: Record<string, typeof filteredExpenses> = {};
            for (const item of filteredExpenses) {
              if (!grouped[item.category]) grouped[item.category] = [];
              grouped[item.category].push(item);
            }
            // sort categories by total USD desc
            const sortedCats = Object.entries(grouped).sort((a, b) => {
              const sum = (items: typeof filteredExpenses) => items.reduce((s, it) => {
                const n = Number(it.amount);
                if (it.currency === 'VND') return s + n / usdToVnd;
                if (it.currency === 'KRW') return s + n / usdToKrw;
                return s + n;
              }, 0);
              return sum(b[1]) - sum(a[1]);
            });

            return (
              <>
                {summaryCard && (
                  <div className="bg-rose-50 rounded-xl p-3 border border-rose-100">
                    <p className="text-xs font-semibold text-rose-700">{periodLabel[exPeriod]} 총 지출 · <span className="font-normal text-rose-400">Tổng chi tiêu</span></p>
                    <p className="text-xl font-bold text-rose-800 mt-1">
                      ${Math.round(totalUsd).toLocaleString()}
                      <span className="text-sm font-medium text-rose-400 ml-2">(₫{Math.round(totalUsd * usdToVnd).toLocaleString()})</span>
                    </p>
                  </div>
                )}

                {filteredExpenses.length === 0 ? (
                  <div className="py-10 text-center text-gray-400 text-sm bg-white rounded-2xl shadow-sm">
                    <p className="text-2xl mb-2">📉</p>
                    <p>지출 내역이 없어요</p>
                    <p className="text-[11px] mt-0.5">Chưa có chi tiêu</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedCats.map(([cat, items]) => {
                      const catUsd = items.reduce((s, it) => {
                        const n = Number(it.amount);
                        if (it.currency === 'VND') return s + n / usdToVnd;
                        if (it.currency === 'KRW') return s + n / usdToKrw;
                        return s + n;
                      }, 0);
                      return (
                        <div key={cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                          <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
                            <span className="text-xs font-semibold text-rose-700">{cat} · <span className="font-normal text-rose-400">{EXPENSE_CATEGORY_VI[cat] ?? cat}</span></span>
                            <span className="text-xs font-bold text-rose-800">
                              ${Math.round(catUsd).toLocaleString()}
                              <span className="font-medium text-rose-400 ml-1">(₫{Math.round(catUsd * usdToVnd).toLocaleString()})</span>
                            </span>
                          </div>
                          <ul className="divide-y divide-gray-50">
                            {items.map(item => {
                              const n = Number(item.amount);
                              const itemUsd = item.currency === 'VND' ? n / usdToVnd : item.currency === 'KRW' ? n / usdToKrw : n;
                              return (
                                <li key={item.id}>
                                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      {item.merchant && <p className="text-xs text-gray-700 font-medium truncate">{item.merchant}</p>}
                                      <p className="text-xs text-gray-400 mt-0.5">{item.date}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <div className="text-right">
                                        {item.currency === 'VND' ? (
                                          <p className="text-sm font-bold text-rose-700">₫{Math.round(n).toLocaleString()}</p>
                                        ) : item.currency === 'KRW' ? (
                                          <>
                                            <p className="text-sm font-bold text-rose-700">₩{Math.round(n).toLocaleString()}</p>
                                            <p className="text-xs text-rose-400">₫{Math.round(itemUsd * usdToVnd).toLocaleString()}</p>
                                          </>
                                        ) : (
                                          <>
                                            <p className="text-sm font-bold text-rose-700">${Math.round(n).toLocaleString()}</p>
                                            <p className="text-xs text-rose-400">₫{Math.round(itemUsd * usdToVnd).toLocaleString()}</p>
                                          </>
                                        )}
                                      </div>
                                      <button onClick={() => editingId === item.id ? setEditingId(null) : startEdit(item)}
                                        className={`p-1 transition-colors text-sm ${editingId === item.id ? 'text-indigo-500' : 'text-gray-300 hover:text-indigo-400'}`}>✏️</button>
                                      <button onClick={() => handleDeleteExpense(item.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1 text-sm">✕</button>
                                    </div>
                                  </div>
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
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
