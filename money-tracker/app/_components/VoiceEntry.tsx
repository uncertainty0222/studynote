'use client';

import { useEffect, useRef, useState } from 'react';

type Phase = 'listening' | 'typing' | 'sending' | 'done' | 'error';

interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}

const speechSupported = () =>
  typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

function getRecognition(): Recognition | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export default function VoiceEntry({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('listening');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [showSiri, setShowSiri] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const textRef = useRef('');

  async function submit(said: string) {
    const t = said.trim();
    if (!t) { setPhase('typing'); return; }
    setPhase('sending');
    const res = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) })
      .catch(() => null);
    const d = res ? await res.json().catch(() => ({})) as { ok?: boolean; message?: string } : {};
    setMessage(d.message ?? '서버에 연결하지 못했어요');
    if (res?.ok && d.ok) {
      setPhase('done');
      onSaved();
      setTimeout(() => setOpen(false), 2500);
    } else {
      setPhase('error');
    }
  }

  function listen() {
    const rec = getRecognition();
    if (!rec) { setPhase('typing'); return; }
    recRef.current = rec;
    textRef.current = '';
    setText('');
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = e => {
      const all = Array.from(e.results).map(r => r[0].transcript).join(' ');
      textRef.current = all;
      setText(all);
    };
    rec.onerror = ev => { if (ev.error !== 'no-speech' && ev.error !== 'aborted') setPhase('typing'); };
    rec.onend = () => {
      recRef.current = null;
      if (textRef.current.trim()) submit(textRef.current);
      else setPhase(p => (p === 'listening' ? 'typing' : p));
    };
    setPhase('listening');
    try { rec.start(); } catch { setPhase('typing'); }
  }

  function start() {
    setOpen(true); setMessage(''); setText('');
    listen();
  }

  function close() {
    recRef.current?.abort();
    recRef.current = null;
    setOpen(false);
  }

  useEffect(() => () => recRef.current?.abort(), []);

  return (
    <>
      <button onClick={start} aria-label="말로 기록"
        className="flex items-center gap-2.5 px-6 py-3 bg-indigo-600 text-white rounded-full shadow-sm active:brightness-90 transition-all">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
        </svg>
        <div className="text-left">
          <span className="block text-[13px] font-bold leading-tight">말로 기록</span>
          <span className="block text-[11px] leading-tight opacity-75">Ghi bằng giọng nói</span>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30 p-4" onClick={close}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-bold text-gray-900">말로 기록 <span className="text-xs font-normal text-gray-400">· Ghi bằng giọng nói</span></p>
              <button onClick={close} className="text-gray-400 text-lg leading-none" aria-label="닫기">✕</button>
            </div>

            {phase === 'listening' && (
              <div className="text-center py-4">
                <button onClick={() => recRef.current?.stop()} className="w-20 h-20 rounded-full bg-rose-500 text-white mx-auto flex items-center justify-center animate-pulse" aria-label="말하기 끝">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
                </button>
                <p className="text-sm text-gray-500 mt-3">듣고 있어요… 말이 끝나면 자동으로 올라가요</p>
                <p className="text-sm text-gray-900 mt-2 min-h-[1.5rem]">{text}</p>
                <p className="text-[11px] text-gray-400 mt-2">예: “나나한테 투어비로 백오십만 동 줬어”</p>
              </div>
            )}

            {(phase === 'typing' || phase === 'error') && (
              <div>
                {phase === 'error' && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 mb-3">{message}</p>}
                <textarea autoFocus value={text} onChange={e => setText(e.target.value)} rows={3}
                  placeholder="키보드의 🎤 버튼을 눌러 말하거나 적어주세요. 예: 나나한테 투어비로 백오십만 동 줬어"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => submit(text)} disabled={!text.trim()} className="flex-1 bg-indigo-600 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg">올리기</button>
                  {speechSupported() && <button onClick={listen} className="px-4 bg-gray-100 text-gray-700 text-sm rounded-lg">다시 말하기</button>}
                </div>
              </div>
            )}

            {phase === 'sending' && (
              <div className="text-center py-6">
                <p className="text-sm text-gray-900">“{text}”</p>
                <p className="text-sm text-gray-500 mt-3">정리해서 올리는 중…</p>
              </div>
            )}

            {phase === 'done' && (
              <div className="text-center py-6">
                <p className="text-3xl">✓</p>
                <p className="text-sm text-gray-900 mt-2">{message}</p>
                <p className="text-[11px] text-gray-400 mt-1">나나가 확인하면 반영돼요 · Chờ Nana xác nhận</p>
              </div>
            )}

            <div className="border-t border-gray-100 mt-4 pt-3">
              <button onClick={() => setShowSiri(v => !v)} className="text-xs text-indigo-500">{showSiri ? '▲' : '▼'} 시리로 기록하기 설정 (앱 안 열고 “시리야, 나나금고”)</button>
              {showSiri && <SiriSetup />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SiriSetup() {
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState('');
  const url = typeof window !== 'undefined' ? `${window.location.origin}/api/voice?format=text` : '';

  useEffect(() => {
    fetch('/api/voice/token').then(r => r.json()).then(d => setToken(d.token ?? '')).catch(() => {});
  }, []);

  const copy = (label: string, v: string) => {
    navigator.clipboard?.writeText(v).then(() => { setCopied(label); setTimeout(() => setCopied(''), 1500); }).catch(() => {});
  };

  async function rotate() {
    if (!confirm('새 키를 만들면 지금 쓰는 단축어는 멈춰요. 계속할까요?')) return;
    const d = await fetch('/api/voice/token', { method: 'POST' }).then(r => r.json());
    setToken(d.token ?? '');
  }

  return (
    <div className="mt-2 text-xs text-gray-600 space-y-2">
      <ol className="list-decimal pl-4 space-y-1">
        <li><b>단축어</b> 앱 → <b>+</b> → 이름을 <b>나나금고</b>로</li>
        <li><b>텍스트 받아쓰기</b> 추가 (언어: 한국어)</li>
        <li><b>URL 콘텐츠 가져오기</b> 추가 → URL은 아래 주소, 방법 <b>POST</b></li>
        <li>헤더 추가: 키 <b>Authorization</b>, 값 <b>Bearer 키</b> (아래 값 그대로)</li>
        <li>요청 본문 <b>JSON</b> → 키 <b>text</b>, 값은 <b>받아쓴 텍스트</b></li>
        <li><b>알림 보기</b> 추가 → 내용은 <b>URL의 콘텐츠</b></li>
        <li>이제 “<b>시리야, 나나금고</b>” 하고 바로 말하면 끝</li>
      </ol>
      <div className="bg-gray-50 rounded-lg p-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-10 flex-shrink-0">주소</span>
          <code className="flex-1 truncate text-gray-800">{url}</code>
          <button onClick={() => copy('url', url)} className="text-indigo-500 flex-shrink-0">{copied === 'url' ? '복사됨' : '복사'}</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-10 flex-shrink-0">헤더값</span>
          <code className="flex-1 truncate text-gray-800">{token ? `Bearer ${token}` : '...'}</code>
          <button onClick={() => copy('token', `Bearer ${token}`)} disabled={!token} className="text-indigo-500 flex-shrink-0">{copied === 'token' ? '복사됨' : '복사'}</button>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">이 키는 비밀번호처럼 다뤄주세요. 노출됐다면 <button onClick={rotate} className="underline">새 키 만들기</button></p>
    </div>
  );
}
