'use client';

import { useState, useEffect, useCallback } from 'react';

interface Transaction {
  id: number;
  payer: 'husband' | 'wife';
  amount: number;
  memo: string;
  date: string;
  created_at: string;
}

interface Balance {
  husbandOwes: number;
  husbandTotal: number;
  wifeTotal: number;
}

const T = {
  ko: {
    appTitle: '우리 가계부',
    appSub: '부부 공유 돈 관리',
    addBtn: '+ 거래 추가',
    balanceLabel: '현재 잔액 현황',
    settled: '정산 완료!',
    settledSub: '현재 서로 주고받을 돈이 없어요',
    husbandOwes: (amt: string) => `남편 → 아내: ${amt}`,
    wifeOwes: (amt: string) => `아내 → 남편: ${amt}`,
    husbandTotal: (amt: string) => `남편 총 지출 ${amt}`,
    wifeTotal: (amt: string) => `아내 총 지출 ${amt}`,
    historyTitle: '거래 내역',
    loading: '불러오는 중...',
    emptyTitle: '거래 내역이 없어요',
    emptySub: '위 버튼으로 첫 거래를 추가해보세요',
    husband: '남편',
    wife: '아내',
    husbandInitial: '남',
    wifeInitial: '아',
    modalTitle: '거래 추가',
    whoLabel: '누가 지불했나요?',
    amountLabel: '금액 (원)',
    amountPlaceholder: '예: 50,000',
    memoLabel: '내용',
    memoPlaceholder: '예: 마트 장보기, 식사비 등',
    dateLabel: '날짜',
    saving: '저장 중...',
    save: '저장',
    deleteTitle: '거래 삭제',
    deleteConfirm: '이 거래 내역을 삭제할까요? 되돌릴 수 없어요.',
    cancel: '취소',
    delete: '삭제',
    errPayer: '지불자를 선택해주세요',
    errAmount: '올바른 금액을 입력해주세요',
    errMemo: '내용을 입력해주세요',
    errDate: '날짜를 선택해주세요',
    errGeneral: '오류가 발생했습니다',
    unit: '원',
  },
  vi: {
    appTitle: 'Sổ Chi Tiêu',
    appSub: 'Quản lý tiền vợ chồng',
    addBtn: '+ Thêm giao dịch',
    balanceLabel: 'Số dư hiện tại',
    settled: 'Đã thanh toán xong!',
    settledSub: 'Hiện không có tiền cần trả cho nhau',
    husbandOwes: (amt: string) => `Chồng → Vợ: ${amt}`,
    wifeOwes: (amt: string) => `Vợ → Chồng: ${amt}`,
    husbandTotal: (amt: string) => `Chồng đã trả ${amt}`,
    wifeTotal: (amt: string) => `Vợ đã trả ${amt}`,
    historyTitle: 'Lịch sử giao dịch',
    loading: 'Đang tải...',
    emptyTitle: 'Chưa có giao dịch nào',
    emptySub: 'Nhấn nút trên để thêm giao dịch đầu tiên',
    husband: 'Chồng',
    wife: 'Vợ',
    husbandInitial: 'C',
    wifeInitial: 'V',
    modalTitle: 'Thêm giao dịch',
    whoLabel: 'Ai đã trả tiền?',
    amountLabel: 'Số tiền (won)',
    amountPlaceholder: 'Ví dụ: 50,000',
    memoLabel: 'Nội dung',
    memoPlaceholder: 'Ví dụ: đi chợ, ăn uống...',
    dateLabel: 'Ngày',
    saving: 'Đang lưu...',
    save: 'Lưu',
    deleteTitle: 'Xóa giao dịch',
    deleteConfirm: 'Bạn có muốn xóa giao dịch này không? Không thể hoàn tác.',
    cancel: 'Hủy',
    delete: 'Xóa',
    errPayer: 'Vui lòng chọn người trả tiền',
    errAmount: 'Vui lòng nhập số tiền hợp lệ',
    errMemo: 'Vui lòng nhập nội dung',
    errDate: 'Vui lòng chọn ngày',
    errGeneral: 'Đã xảy ra lỗi',
    unit: '₩',
  },
};

type Lang = 'ko' | 'vi';

function formatAmount(amount: number, lang: Lang): string {
  if (lang === 'vi') return '₩' + amount.toLocaleString('ko-KR');
  return amount.toLocaleString('ko-KR') + '원';
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${year}.${month}.${day}`;
}

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>('ko');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [payer, setPayer] = useState<'husband' | 'wife'>('husband');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(todayString());
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const t = T[lang];

  useEffect(() => {
    const saved = localStorage.getItem('lang') as Lang | null;
    if (saved === 'ko' || saved === 'vi') setLang(saved);
  }, []);

  function toggleLang() {
    const next: Lang = lang === 'ko' ? 'vi' : 'ko';
    setLang(next);
    localStorage.setItem('lang', next);
  }

  const fetchData = useCallback(async () => {
    const [txRes, balRes] = await Promise.all([
      fetch('/api/transactions'),
      fetch('/api/balance'),
    ]);
    const txData = await txRes.json();
    const balData = await balRes.json();
    setTransactions(txData.transactions);
    setBalance(balData);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    const rawAmount = amount.replace(/,/g, '');
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payer, amount: rawAmount, memo, date }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setFormError(data.error ?? t.errGeneral);
      return;
    }

    setAmount('');
    setMemo('');
    setDate(todayString());
    setShowForm(false);
    await fetchData();
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDeleteId(null);
      await fetchData();
    }
  }

  function handleAmountChange(val: string) {
    const numeric = val.replace(/[^0-9]/g, '');
    if (numeric === '') { setAmount(''); return; }
    setAmount(Number(numeric).toLocaleString('ko-KR'));
  }

  const balanceInfo = () => {
    if (!balance) return null;
    const owes = balance.husbandOwes;
    if (owes === 0) {
      return { msg: t.settled, sub: t.settledSub, color: 'text-green-700', bg: 'bg-green-50 border-green-200' };
    }
    if (owes > 0) {
      return {
        msg: t.husbandOwes(formatAmount(owes, lang)),
        sub: `${t.husbandTotal(formatAmount(balance.husbandTotal, lang))} / ${t.wifeTotal(formatAmount(balance.wifeTotal, lang))}`,
        color: 'text-blue-700',
        bg: 'bg-blue-50 border-blue-200',
      };
    }
    return {
      msg: t.wifeOwes(formatAmount(Math.abs(owes), lang)),
      sub: `${t.wifeTotal(formatAmount(balance.wifeTotal, lang))} / ${t.husbandTotal(formatAmount(balance.husbandTotal, lang))}`,
      color: 'text-rose-700',
      bg: 'bg-rose-50 border-rose-200',
    };
  };

  const bal = balanceInfo();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t.appTitle}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{t.appSub}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              title="언어 변경 / Đổi ngôn ngữ"
            >
              {lang === 'ko' ? '🇻🇳 Tiếng Việt' : '🇰🇷 한국어'}
            </button>
            <button
              onClick={() => { setShowForm(true); setFormError(''); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {t.addBtn}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Balance Card */}
        {bal && (
          <div className={`rounded-2xl border p-5 ${bal.bg}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{t.balanceLabel}</p>
            <p className={`text-lg font-bold ${bal.color}`}>{bal.msg}</p>
            <p className="text-xs text-gray-500 mt-1">{bal.sub}</p>
          </div>
        )}

        {/* Transaction List */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">{t.historyTitle}</h2>
          </div>

          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">{t.loading}</div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              <p className="text-3xl mb-2">💸</p>
              <p>{t.emptyTitle}</p>
              <p className="text-xs mt-1">{t.emptySub}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {transactions.map((tx) => (
                <li key={tx.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    tx.payer === 'husband' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-600'
                  }`}>
                    {tx.payer === 'husband' ? t.husbandInitial : t.wifeInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{tx.memo}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {tx.payer === 'husband' ? t.husband : t.wife} · {formatDate(tx.date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-sm font-semibold ${tx.payer === 'husband' ? 'text-blue-700' : 'text-rose-600'}`}>
                      {formatAmount(tx.amount, lang)}
                    </span>
                    <button
                      onClick={() => setDeleteId(tx.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors p-1"
                      title={t.delete}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {/* Add Transaction Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">{t.modalTitle}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-2">{t.whoLabel}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['husband', 'wife'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPayer(p)}
                      className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        payer === p
                          ? p === 'husband' ? 'bg-blue-600 text-white' : 'bg-rose-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {p === 'husband' ? t.husband : t.wife}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">{t.amountLabel}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder={t.amountPlaceholder}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">{t.memoLabel}</label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={t.memoPlaceholder}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">{t.dateLabel}</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  required
                />
              </div>

              {formError && (
                <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors text-sm"
              >
                {submitting ? t.saving : t.save}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t.deleteTitle}</h3>
            <p className="text-sm text-gray-500 mb-5">{t.deleteConfirm}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700 transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors"
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
