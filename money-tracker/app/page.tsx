'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PersonalTab from './_components/PersonalTab';
import ChongTab from './_components/ChongTab';

interface User { id: number; role: 'husband' | 'wife'; name: string; username: string; }
interface Transaction {
  id: number; payer: 'husband' | 'wife'; amount: number; memo: string;
  date: string; status: 'pending' | 'approved' | 'rejected'; created_by: 'husband' | 'wife'; created_at: string;
}
interface DeletionRequest {
  id: number; transaction_id: number; requested_by: 'husband' | 'wife'; status: string;
  payer: 'husband' | 'wife'; amount: number; memo: string; date: string;
}
interface Balance { husbandOwes: number; husbandTotal: number; wifeTotal: number; }
interface ShoppingItem {
  id: number; name: string; added_by: 'husband' | 'wife';
  status: 'needed' | 'bought'; bought_by: 'husband' | 'wife' | null;
  bought_at: string | null; check_memo: string;
  created_at: string; comment_count: number;
}
interface ShoppingComment {
  id: number; item_id: number; author: 'husband' | 'wife'; content: string; created_at: string;
}

// ─── Translations ──────────────────────────────────────────────────────────
const T = {
  ko: {
    appTitle: 'VOCHONG', appSub: '부부 공유 돈 관리',
    addBtn: '+ 거래 추가', logout: '로그아웃',
    balanceLabel: '현재 잔액 현황', settled: '정산 완료!',
    settledSub: '서로 주고받을 돈이 없어요',
    husbandOwes: (a: string) => `남편 → 아내: ${a}`,
    wifeOwes: (a: string) => `아내 → 남편: ${a}`,
    husbandTotal: (a: string) => `남편 총 지출 ${a}`,
    wifeTotal: (a: string) => `아내 총 지출 ${a}`,
    pendingTitle: '승인 대기 중',
    pendingDesc: (n: number) => `파트너가 요청한 항목이 ${n}개 있어요. 확인 후 승인해주세요.`,
    newTxRequest: (name: string) => `${name}이(가) 새 거래를 요청했어요`,
    delRequest: (name: string) => `${name}이(가) 삭제를 요청했어요`,
    approve: '승인', reject: '거절',
    historyTitle: '거래 내역',
    myPending: '승인 대기 (내 요청)',
    loading: '불러오는 중...', emptyTitle: '거래 내역이 없어요',
    emptySub: '위 버튼으로 첫 거래를 추가해보세요',
    husband: '남편', wife: '아내', husbandInitial: '남', wifeInitial: '아',
    modalTitle: '거래 추가', whoLabel: '누가 지불했나요?',
    amountLabel: '금액 (₫)', amountPlaceholder: '예: 50,000',
    memoLabel: '내용', memoPlaceholder: '예: 마트 장보기, 식사비 등',
    dateLabel: '날짜', saving: '저장 중...', save: '저장',
    deleteTitle: '삭제 요청', deleteConfirm: '파트너의 동의를 받은 후 삭제됩니다. 요청할까요?',
    cancel: '취소', requestDelete: '삭제 요청',
    waitingApproval: '파트너 승인 대기 중',
    deletionPending: '삭제 요청 중',
    errGeneral: '오류가 발생했습니다',
    unit: '원',
    tabMoney: '남편과 아내', tabShopping: '장보기', tabPersonal: '우리의 자산 (쑥쑥 자라라!)', tabChong: '현금 흐름 한눈에 보기',
    shopPlaceholder: '쓰레기봉투, 세제 등...', shopAdd: '추가',
    shopEmpty: '필요한 물건을 추가해보세요',
    shopBoughtBy: (n: string) => `${n}이(가) 구매`,
    shopCommentPlaceholder: '댓글 입력...', shopSend: '전송',
    shopCommentCount: (n: number) => `💬 ${n}`,
  },
  vi: {
    appTitle: 'VOCHONG', appSub: 'Quản lý tiền vợ chồng',
    addBtn: '+ Thêm giao dịch', logout: 'Đăng xuất',
    balanceLabel: 'Số dư hiện tại', settled: 'Đã thanh toán xong!',
    settledSub: 'Hiện không có tiền cần trả cho nhau',
    husbandOwes: (a: string) => `Chồng → Vợ: ${a}`,
    wifeOwes: (a: string) => `Vợ → Chồng: ${a}`,
    husbandTotal: (a: string) => `Chồng đã trả ${a}`,
    wifeTotal: (a: string) => `Vợ đã trả ${a}`,
    pendingTitle: 'Chờ xác nhận',
    pendingDesc: (n: number) => `Có ${n} mục bạn đời yêu cầu. Vui lòng xem và xác nhận.`,
    newTxRequest: (name: string) => `${name} đã yêu cầu thêm giao dịch`,
    delRequest: (name: string) => `${name} đã yêu cầu xóa`,
    approve: 'Đồng ý', reject: 'Từ chối',
    historyTitle: 'Lịch sử giao dịch',
    myPending: 'Chờ duyệt (yêu cầu của tôi)',
    loading: 'Đang tải...', emptyTitle: 'Chưa có giao dịch nào',
    emptySub: 'Nhấn nút trên để thêm giao dịch đầu tiên',
    husband: 'Chồng', wife: 'Vợ', husbandInitial: 'C', wifeInitial: 'V',
    modalTitle: 'Thêm giao dịch', whoLabel: 'Ai đã trả tiền?',
    amountLabel: 'Số tiền (₫)', amountPlaceholder: 'Ví dụ: 50,000',
    memoLabel: 'Nội dung', memoPlaceholder: 'Ví dụ: đi chợ, ăn uống...',
    dateLabel: 'Ngày', saving: 'Đang lưu...', save: 'Lưu',
    deleteTitle: 'Yêu cầu xóa', deleteConfirm: 'Bạn đời cần đồng ý thì mới xóa được. Gửi yêu cầu?',
    cancel: 'Hủy', requestDelete: 'Yêu cầu xóa',
    waitingApproval: 'Đang chờ bạn đời xác nhận',
    deletionPending: 'Đang yêu cầu xóa',
    errGeneral: 'Đã xảy ra lỗi',
    unit: '₩',
    tabMoney: 'Chồng và Vợ ❤️', tabShopping: 'Mua Sắm', tabPersonal: 'Tài sản của chúng ta 🌱', tabChong: 'Dòng tiền tổng quan',
    shopPlaceholder: 'Túi rác, xà phòng,...', shopAdd: 'Thêm',
    shopEmpty: 'Hãy thêm đồ cần mua',
    shopBoughtBy: (n: string) => `${n} đã mua`,
    shopCommentPlaceholder: 'Nhập bình luận...', shopSend: 'Gửi',
    shopCommentCount: (n: number) => `💬 ${n}`,
  },
};
type Lang = 'ko' | 'vi';

function playBeep(ctx: AudioContext | null) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  [880, 1100].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.15;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    osc.start(start);
    osc.stop(start + 0.26);
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function formatAmt(amount: number, _lang?: Lang) {
  return amount.toLocaleString('ko-KR') + ' ₫';
}
function fmtDate(d: string) {
  const [y, m, dd] = d.split('-');
  return `${y}.${m}.${dd}`;
}
function today() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('ko');
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [activeTab, setActiveTab] = useState<'couple' | 'personal' | 'chong'>('personal');
  const [shopItems, setShopItems] = useState<ShoppingItem[]>([]);
  const [shopInput, setShopInput] = useState('');
  const [shopSubmitting, setShopSubmitting] = useState(false);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, ShoppingComment[]>>({});
  const [commentInput, setCommentInput] = useState<Record<number, string>>({});
  const [loadingComments, setLoadingComments] = useState<Record<number, boolean>>({});
  const [checkingItemId, setCheckingItemId] = useState<number | null>(null);
  const [checkMemos, setCheckMemos] = useState<Record<number, string>>({});
  const [boughtExpanded, setBoughtExpanded] = useState(false);

  // Form state
  const [payer, setPayer] = useState<'husband' | 'wife'>('husband');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(today());
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const t = T[lang];

  useEffect(() => {
    const saved = localStorage.getItem('lang') as Lang | null;
    if (saved === 'ko' || saved === 'vi') setLang(saved);
  }, []);

  // iOS 오디오 언락 (최초 사용자 제스처에서 AudioContext 활성화)
  useEffect(() => {
    function unlock() {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) audioCtxRef.current = new AC();
      }
      audioCtxRef.current?.resume().catch(() => {});
    }
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    document.addEventListener('click', unlock, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
    };
  }, []);

  function toggleLang() {
    const next: Lang = lang === 'ko' ? 'vi' : 'ko';
    setLang(next);
    localStorage.setItem('lang', next);
  }

  // Auth check
  useEffect(() => {
    fetch('/api/auth').then(async res => {
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setUser(data);
    });
  }, [router]);

  const fetchData = useCallback(async () => {
    const [txRes, delRes] = await Promise.all([
      fetch('/api/transactions'),
      fetch('/api/deletion-requests/pending'),
    ]);
    if (txRes.status === 401) { router.push('/login'); return; }
    const txData = await txRes.json();
    const delData = delRes.ok ? await delRes.json() : { requests: [] };
    setTransactions(txData.transactions ?? []);
    setBalance(txData.balance ?? null);
    setPendingCount(txData.pendingCount ?? 0);
    setDeletionRequests(delData.requests ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (user) { fetchData(); }
  }, [user, fetchData]);

  // SSE: 실시간 업데이트 + 인앱 알림음
  useEffect(() => {
    if (!user) return;
    const es = new EventSource('/api/sse');
    es.onmessage = (e) => {
      if (e.data === 'update') playBeep(audioCtxRef.current);
      fetchData();
      fetchShopData();
    };
    return () => es.close();
  }, [user, fetchData]);

  // 푸시 알림 자동 활성화 (로그인 후 권한 요청 + 구독)
  useEffect(() => {
    if (!user) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setPushEnabled(false); return; }
    navigator.serviceWorker.register('/sw.js').then(async reg => {
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        setPushEnabled(true);
        fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(existing) }).catch(() => {});
        return;
      }
      // 권한 요청 (아직 없으면)
      const permission = typeof Notification !== 'undefined' ? await Notification.requestPermission() : 'denied';
      if (permission !== 'granted') { setPushEnabled(false); return; }
      const { publicKey } = await fetch('/api/push/vapid-key').then(r => r.json());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as any });
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
      setPushEnabled(true);
    }).catch(() => setPushEnabled(false));
  }, [user]);

  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const { publicKey } = await fetch('/api/push/vapid-key').then(r => r.json());
      const existing = await reg.pushManager.getSubscription();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as any });
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
      setPushEnabled(true);
    } catch {
      // 지원 안 하거나 거부
    }
  }

  async function disablePush() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setPushEnabled(false);
    } catch {
      // ignore
    }
  }

  // Poll every 2min as fallback
  useEffect(() => {
    const id = setInterval(() => { if (user) fetchData(); }, 120000);
    return () => clearInterval(id);
  }, [user, fetchData]);

  const fetchShopData = useCallback(async () => {
    const res = await fetch('/api/shopping');
    if (res.status === 401) { router.push('/login'); return; }
    const data = await res.json();
    setShopItems(data.items ?? []);
  }, [router]);

  useEffect(() => {
    if (user) fetchShopData();
  }, [user, fetchShopData]);

  async function handleAddShopItem(e: React.FormEvent) {
    e.preventDefault();
    if (!shopInput.trim()) return;
    setShopSubmitting(true);
    await fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: shopInput.trim() }) });
    setShopInput('');
    setShopSubmitting(false);
    await fetchShopData();
  }

  async function handleCheckShopItem(id: number) {
    const memo = checkMemos[id]?.trim() ?? '';
    setCheckingItemId(null);
    await fetch(`/api/shopping/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memo }) });
    await fetchShopData();
  }

  async function handleUncheckShopItem(id: number) {
    await fetch(`/api/shopping/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'uncheck' }) });
    await fetchShopData();
  }

  async function handleDeleteShopItem(id: number) {
    await fetch(`/api/shopping/${id}`, { method: 'DELETE' });
    await fetchShopData();
  }

  async function handleExpandItem(id: number) {
    if (expandedItem === id) { setExpandedItem(null); return; }
    setExpandedItem(id);
    if (!comments[id]) {
      setLoadingComments(prev => ({ ...prev, [id]: true }));
      const res = await fetch(`/api/shopping/${id}/comments`);
      const data = await res.json();
      setComments(prev => ({ ...prev, [id]: data.comments ?? [] }));
      setLoadingComments(prev => ({ ...prev, [id]: false }));
    }
  }

  async function handleAddComment(itemId: number) {
    const content = commentInput[itemId]?.trim();
    if (!content) return;
    await fetch(`/api/shopping/${itemId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    setCommentInput(prev => ({ ...prev, [itemId]: '' }));
    const res = await fetch(`/api/shopping/${itemId}/comments`);
    const data = await res.json();
    setComments(prev => ({ ...prev, [itemId]: data.comments ?? [] }));
    await fetchShopData();
  }

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payer, amount: amount.replace(/,/g, ''), memo, date }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setFormError(data.error ?? t.errGeneral); return; }
    setAmount(''); setMemo(''); setDate(today()); setShowForm(false);
    await fetchData();
  }

  async function handleDeleteRequest(tx: Transaction) {
    await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    await fetchData();
  }

  async function handleTxAction(id: number, action: 'approve' | 'reject') {
    await fetch(`/api/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await fetchData();
  }

  async function handleDelAction(id: number, action: 'approve' | 'reject') {
    await fetch(`/api/deletion-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await fetchData();
  }

  function handleAmountChange(val: string) {
    const n = val.replace(/[^0-9]/g, '');
    setAmount(n === '' ? '' : Number(n).toLocaleString('ko-KR'));
  }

  // Derived data
  const partnerRole: 'husband' | 'wife' | null = user ? (user.role === 'husband' ? 'wife' : 'husband') : null;
  const pendingForMe = transactions.filter(tx => tx.status === 'pending' && tx.created_by !== user?.role);
  const pendingDelForMe = deletionRequests.filter(dr => dr.requested_by !== user?.role);
  const myPending = transactions.filter(tx => tx.status === 'pending' && tx.created_by === user?.role);
  const hasPendingDeletion = (txId: number) => deletionRequests.some(dr => dr.transaction_id === txId && dr.requested_by === user?.role);
  const approved = transactions.filter(tx => tx.status === 'approved');

  const balInfo = () => {
    if (!balance) return null;
    const owes = balance.husbandOwes;
    if (owes === 0) return { msg: t.settled, sub: t.settledSub, color: 'text-green-700', bg: 'bg-green-50 border-green-200' };
    if (owes > 0) return {
      msg: t.husbandOwes(formatAmt(owes, lang)),
      sub: `${t.husbandTotal(formatAmt(balance.husbandTotal, lang))} / ${t.wifeTotal(formatAmt(balance.wifeTotal, lang))}`,
      color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200',
    };
    return {
      msg: t.wifeOwes(formatAmt(Math.abs(owes), lang)),
      sub: `${t.wifeTotal(formatAmt(balance.wifeTotal, lang))} / ${t.husbandTotal(formatAmt(balance.husbandTotal, lang))}`,
      color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200',
    };
  };
  const bal = balInfo();

  const PayerBadge = ({ role }: { role: 'husband' | 'wife' }) => (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
      role === 'husband' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-600'
    }`}>
      {role === 'husband' ? t.husbandInitial : t.wifeInitial}
    </div>
  );

  if (!user) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">{t.loading}</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900">{t.appTitle}</h1>
            <p className="text-xs text-gray-400">{user.name} ({user.role === 'husband' ? t.husband : t.wife})</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
            <button onClick={toggleLang} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              {lang === 'ko' ? '🇻🇳' : '🇰🇷'}
            </button>
            <button
              onClick={() => { setShowForm(true); setFormError(''); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              {t.addBtn}
            </button>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5">
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Tab Navigation */}
        <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
          <button onClick={() => setActiveTab('personal')} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${activeTab === 'personal' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}>
            {t.tabPersonal}
          </button>
          <button onClick={() => setActiveTab('chong')} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${activeTab === 'chong' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}>
            {t.tabChong}
          </button>
          <button onClick={() => setActiveTab('couple')} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${activeTab === 'couple' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}>
            {t.tabMoney}
          </button>
        </div>

        {/* ── Assets Dashboard ── */}
        {activeTab === 'personal' && user && (
          <PersonalTab user={user} lang={lang} />
        )}

        {/* ── Chong Tab (수입 + 지출) ── */}
        {activeTab === 'chong' && user && (
          <ChongTab user={user} />
        )}

        {/* ── Couple Tab (가계부 + 장보기 통합) ── */}
        {activeTab === 'couple' && <>
        {/* Balance Card */}
        {bal && (
          <div className={`rounded-2xl border p-4 ${bal.bg}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{t.balanceLabel}</p>
            <p className={`text-base font-bold ${bal.color}`}>{bal.msg}</p>
            <p className="text-xs text-gray-500 mt-1">{bal.sub}</p>
          </div>
        )}

        {/* ── Pending Approval Section ── */}
        {(pendingForMe.length > 0 || pendingDelForMe.length > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2">
              <span className="text-base">🔔</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">{t.pendingTitle}</p>
                <p className="text-xs text-amber-600">{t.pendingDesc(pendingForMe.length + pendingDelForMe.length)}</p>
              </div>
            </div>
            <ul className="divide-y divide-amber-100">
              {pendingForMe.map(tx => (
                <li key={tx.id} className="px-4 py-3">
                  <div className="flex items-center gap-3 mb-2">
                    <PayerBadge role={tx.payer} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-amber-700 font-medium">{t.newTxRequest(tx.payer === 'husband' ? t.husband : t.wife)}</p>
                      <p className="text-sm font-medium text-gray-900 truncate">{tx.memo}</p>
                      <p className="text-xs text-gray-400">{tx.payer === 'husband' ? t.husband : t.wife} · {fmtDate(tx.date)} · <span className={`font-semibold ${tx.payer === 'husband' ? 'text-blue-700' : 'text-rose-600'}`}>{formatAmt(tx.amount, lang)}</span></p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleTxAction(tx.id, 'approve')} className="flex-1 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors">{t.approve}</button>
                    <button onClick={() => handleTxAction(tx.id, 'reject')} className="flex-1 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium rounded-lg transition-colors">{t.reject}</button>
                  </div>
                </li>
              ))}
              {pendingDelForMe.map(dr => (
                <li key={`del-${dr.id}`} className="px-4 py-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-sm flex-shrink-0">🗑</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-amber-700 font-medium">{t.delRequest(dr.requested_by === 'husband' ? t.husband : t.wife)}</p>
                      <p className="text-sm font-medium text-gray-900 truncate">{dr.memo}</p>
                      <p className="text-xs text-gray-400">{dr.payer === 'husband' ? t.husband : t.wife} · {fmtDate(dr.date)} · <span className="font-semibold">{formatAmt(dr.amount, lang)}</span></p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleDelAction(dr.id, 'approve')} className="flex-1 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors">{t.approve}</button>
                    <button onClick={() => handleDelAction(dr.id, 'reject')} className="flex-1 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium rounded-lg transition-colors">{t.reject}</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── My Pending Items ── */}
        {myPending.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-500">{t.myPending}</p>
            </div>
            <ul className="divide-y divide-gray-50">
              {myPending.map(tx => (
                <li key={tx.id} className="px-4 py-3 flex items-center gap-3 opacity-60">
                  <PayerBadge role={tx.payer} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{tx.memo}</p>
                    <p className="text-xs text-gray-400">{tx.payer === 'husband' ? t.husband : t.wife} · {fmtDate(tx.date)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-semibold ${tx.payer === 'husband' ? 'text-blue-700' : 'text-rose-600'}`}>{formatAmt(tx.amount, lang)}</p>
                    <p className="text-xs text-amber-500">{t.waitingApproval}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Shopping List ── */}
        {(() => {
          const neededItems = shopItems.filter(i => i.status === 'needed');
          const boughtItems = shopItems.filter(i => i.status === 'bought');
          return (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">🛒 {t.tabShopping}</p>
              </div>
              <div className="px-4 py-3 border-b border-gray-50">
                <form onSubmit={handleAddShopItem} className="flex gap-2">
                  <input
                    value={shopInput}
                    onChange={e => setShopInput(e.target.value)}
                    placeholder={t.shopPlaceholder}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button type="submit" disabled={shopSubmitting || !shopInput.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                    {t.shopAdd}
                  </button>
                </form>
              </div>

              {/* 미완료 항목 */}
              {neededItems.length === 0 && boughtItems.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">{t.shopEmpty}</div>
              ) : neededItems.length === 0 ? (
                <div className="py-4 text-center text-gray-400 text-xs">남은 항목 없음 · Không còn gì cần mua</div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {neededItems.map(item => {
                    const isChecking = checkingItemId === item.id;
                    const isExpanded = expandedItem === item.id;
                    const itemComments = comments[item.id] ?? [];
                    return (
                      <li key={item.id} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setCheckingItemId(isChecking ? null : item.id)}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${isChecking ? 'border-green-400 bg-green-50 text-green-500' : 'border-gray-300 text-transparent hover:border-green-400'}`}
                          >✓</button>
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleExpandItem(item.id)}>
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                              <span>{item.added_by === 'husband' ? t.husband : t.wife}</span>
                              {item.comment_count > 0 && <span>{t.shopCommentCount(item.comment_count)}</span>}
                            </p>
                          </div>
                          <button onClick={() => handleDeleteShopItem(item.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1 flex-shrink-0">✕</button>
                        </div>

                        {/* 체크 확인 UI */}
                        {isChecking && (
                          <div className="mt-2.5 ml-10 space-y-2">
                            <input
                              autoFocus
                              value={checkMemos[item.id] ?? ''}
                              onChange={e => setCheckMemos(prev => ({ ...prev, [item.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleCheckShopItem(item.id); if (e.key === 'Escape') setCheckingItemId(null); }}
                              placeholder="메모 (선택) · Ghi chú tùy chọn"
                              className="w-full border border-green-200 rounded-lg px-3 py-1.5 text-xs bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-300"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => handleCheckShopItem(item.id)} className="flex-1 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors">✓ 구매 완료 · Đã mua</button>
                              <button onClick={() => setCheckingItemId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-500 text-xs rounded-lg transition-colors">취소</button>
                            </div>
                          </div>
                        )}

                        {/* 댓글 펼침 */}
                        {isExpanded && !isChecking && (
                          <div className="mt-3 pl-10 space-y-2">
                            {loadingComments[item.id] ? (
                              <p className="text-xs text-gray-400">{t.loading}</p>
                            ) : (
                              <>
                                {itemComments.map(c => (
                                  <div key={c.id} className={`flex items-end gap-2 ${c.author === user?.role ? 'flex-row-reverse' : ''}`}>
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.author === 'husband' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-600'}`}>
                                      {c.author === 'husband' ? t.husbandInitial : t.wifeInitial}
                                    </div>
                                    <div className={`rounded-2xl px-3 py-1.5 text-xs max-w-[75%] ${c.author === user?.role ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                                      {c.content}
                                    </div>
                                  </div>
                                ))}
                                <div className="flex gap-2 pt-1">
                                  <input
                                    value={commentInput[item.id] ?? ''}
                                    onChange={e => setCommentInput(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(item.id); } }}
                                    placeholder={t.shopCommentPlaceholder}
                                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                  />
                                  <button onClick={() => handleAddComment(item.id)} disabled={!commentInput[item.id]?.trim()} className="bg-indigo-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                                    {t.shopSend}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* 완료된 항목 펼치기 */}
              {boughtItems.length > 0 && (
                <div className="border-t border-gray-100">
                  <button
                    onClick={() => setBoughtExpanded(v => !v)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <span>✅ 구매 완료 {boughtItems.length}개 · {boughtItems.length}개 đã mua</span>
                    <span className="text-gray-300">{boughtExpanded ? '▲ 접기' : '▼ 펼치기'}</span>
                  </button>
                  {boughtExpanded && (
                    <ul className="divide-y divide-gray-50 bg-gray-50/50">
                      {boughtItems.map(item => {
                        const buyerName = item.bought_by === 'husband' ? t.husband : item.bought_by === 'wife' ? t.wife : '';
                        const daysLeft = item.bought_at
                          ? Math.ceil((new Date(item.bought_at).getTime() + 7 * 86400000 - Date.now()) / 86400000)
                          : 7;
                        return (
                          <li key={item.id} className="px-4 py-2.5 flex items-start gap-3">
                            <button
                              onClick={() => handleUncheckShopItem(item.id)}
                              className="w-7 h-7 rounded-full bg-green-100 border-2 border-green-400 flex items-center justify-center flex-shrink-0 text-xs font-bold text-green-600 hover:bg-green-200 transition-colors mt-0.5"
                            >✓</button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-400 line-through">{item.name}</p>
                              {item.check_memo && <p className="text-xs text-gray-500 mt-0.5">💬 {item.check_memo}</p>}
                              <p className="text-[10px] text-gray-300 mt-0.5">
                                {buyerName} · {daysLeft > 0 ? `${daysLeft}일 후 삭제` : '오늘 삭제'}
                              </p>
                            </div>
                            <button onClick={() => handleDeleteShopItem(item.id)} className="text-gray-200 hover:text-red-400 transition-colors p-1 flex-shrink-0 text-xs mt-0.5">✕</button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Approved Transactions ── */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">{t.historyTitle}</h2>
          </div>
          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">{t.loading}</div>
          ) : approved.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              <p className="text-3xl mb-2">💸</p>
              <p>{t.emptyTitle}</p>
              <p className="text-xs mt-1">{t.emptySub}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {approved.map(tx => {
                const isPendingDel = hasPendingDeletion(tx.id);
                return (
                  <li key={tx.id} className={`px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${isPendingDel ? 'opacity-50' : ''}`}>
                    <PayerBadge role={tx.payer} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{tx.memo}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {tx.payer === 'husband' ? t.husband : t.wife} · {fmtDate(tx.date)}
                        {isPendingDel && <span className="ml-2 text-orange-400">{t.deletionPending}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-sm font-semibold ${tx.payer === 'husband' ? 'text-blue-700' : 'text-rose-600'}`}>
                        {formatAmt(tx.amount, lang)}
                      </span>
                      {!isPendingDel && (
                        <button onClick={() => setDeleteTarget(tx)} className="text-gray-300 hover:text-red-400 transition-colors p-1">✕</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </>}
      </main>

      {/* ── Add Transaction Modal ── */}
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
                  {(['husband', 'wife'] as const).map(p => (
                    <button key={p} type="button" onClick={() => setPayer(p)}
                      className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        payer === p ? (p === 'husband' ? 'bg-blue-600 text-white' : 'bg-rose-500 text-white') : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {p === 'husband' ? t.husband : t.wife}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">{t.amountLabel}</label>
                <input type="text" inputMode="numeric" value={amount} onChange={e => handleAmountChange(e.target.value)}
                  placeholder={t.amountPlaceholder} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">{t.memoLabel}</label>
                <input type="text" value={memo} onChange={e => setMemo(e.target.value)}
                  placeholder={t.memoPlaceholder} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">{t.dateLabel}</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              {formError && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
              <button type="submit" disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors text-sm">
                {submitting ? t.saving : t.save}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Request Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t.deleteTitle}</h3>
            <p className="text-sm text-gray-500 mb-1">{t.deleteConfirm}</p>
            <p className="text-sm font-medium text-gray-700 mb-5 bg-gray-50 rounded-lg px-3 py-2">
              {deleteTarget.memo} — {formatAmt(deleteTarget.amount, lang)}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700 transition-colors">
                {t.cancel}
              </button>
              <button onClick={() => handleDeleteRequest(deleteTarget)}
                className="flex-1 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors">
                {t.requestDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
