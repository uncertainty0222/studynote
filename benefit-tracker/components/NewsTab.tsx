"use client";

import { useState, useEffect, useCallback } from "react";

interface NewsArticle {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  published_at: string | null;
  fetched_at: string;
  is_new: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function useNotificationSetup() {
  const [state, setState] = useState<"idle" | "loading" | "subscribed" | "unsupported" | "error">("idle");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
    }
  }, []);

  const subscribe = useCallback(async () => {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;

      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok) { setState("error"); return; }
      const { publicKey } = await keyRes.json() as { publicKey: string };

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!saveRes.ok) throw new Error("save failed");

      setState("subscribed");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }, []);

  return { state, subscribe };
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0))).buffer;
}

export default function NewsTab() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "no-db">("idle");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const { state: notifState, subscribe } = useNotificationSetup();

  const loadNews = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/news");
      const data = await res.json() as { articles: NewsArticle[]; error?: string };
      if (data.error === "DB_NOT_CONFIGURED") { setStatus("no-db"); return; }
      setArticles(data.articles);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/news/refresh", { method: "POST" });
      const data = await res.json() as { newCount?: number };
      setLastRefreshed(`새 기사 ${data.newCount ?? 0}건 추가됨`);
      await loadNews();
    } catch {
      setLastRefreshed("새로고침 실패");
    } finally {
      setRefreshing(false);
    }
  };

  if (status === "no-db") {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <h3 className="font-bold text-amber-900 mb-2">데이터베이스 설정이 필요해요</h3>
        <p className="text-sm text-amber-800 mb-3">
          뉴스 기능은 PostgreSQL 데이터베이스가 필요합니다.
          Railway 또는 Supabase에서 무료로 만들 수 있어요.
        </p>
        <ol className="text-sm text-amber-800 list-decimal list-inside space-y-1">
          <li>Railway(railway.app) 가입 후 PostgreSQL 서비스 생성</li>
          <li>연결 URL을 <code className="bg-amber-100 px-1 rounded">DATABASE_URL</code> 환경 변수로 설정</li>
          <li>앱 재시작 후 뉴스 탭 다시 확인</li>
        </ol>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 컨트롤 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-gray-900">정책 뉴스 모아보기</h2>
          <p className="text-xs text-gray-500">
            보건복지부·여성가족부·고용노동부 보도자료 자동 수집
          </p>
        </div>
        <div className="flex items-center gap-2">
          {notifState === "idle" && (
            <button
              onClick={subscribe}
              className="text-xs px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 font-medium hover:bg-purple-200 transition-colors cursor-pointer"
            >
              🔔 새 뉴스 알림 받기
            </button>
          )}
          {notifState === "loading" && (
            <span className="text-xs text-gray-500">설정 중...</span>
          )}
          {notifState === "subscribed" && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full font-medium">
              ✅ 알림 설정됨
            </span>
          )}
          {notifState === "unsupported" && (
            <span className="text-xs text-gray-400">알림 미지원 브라우저</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {refreshing ? "수집 중..." : "🔄 지금 새로고침"}
          </button>
        </div>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-gray-500 -mt-2">{lastRefreshed}</p>
      )}

      {/* 뉴스 목록 */}
      {status === "loading" && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-2xl mb-2">📰</div>
          <p className="text-sm">뉴스를 불러오는 중...</p>
        </div>
      )}

      {status === "idle" && articles.length === 0 && (
        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-2xl">
          <div className="text-2xl mb-2">📭</div>
          <p className="text-sm font-medium">아직 수집된 뉴스가 없어요</p>
          <p className="text-xs mt-1">위의 "지금 새로고침" 버튼을 눌러 뉴스를 가져와보세요</p>
        </div>
      )}

      {articles.length > 0 && (
        <div className="flex flex-col gap-3">
          {articles.map((article) => (
            <a
              key={article.id}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`block rounded-xl border p-4 hover:shadow-sm transition-shadow ${
                article.is_new ? "border-purple-200 bg-purple-50" : "border-gray-100 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {article.source}
                    </span>
                    {article.is_new && (
                      <span className="text-xs font-bold bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">
                        NEW
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {formatDate(article.published_at ?? article.fetched_at)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 leading-snug mb-1">
                    {article.title}
                  </p>
                  {article.summary && (
                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                      {article.summary}
                    </p>
                  )}
                </div>
                <span className="text-gray-300 shrink-0 mt-1">→</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
