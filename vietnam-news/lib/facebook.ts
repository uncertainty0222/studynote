// 베트남 인기 페이스북 페이지의 화제 게시글.
// Apify의 공식 수집기(apify/facebook-posts-scraper)로 로그인 없이 공개 게시글을 가져온다.
// APIFY_TOKEN이 없으면 아무것도 하지 않는다.
//
// 비용: Apify가 게시글 수 기준으로 과금하므로 뉴스(15분)와 별도로 FB_REFRESH_HOURS마다만 갱신한다.
// 수집은 수십 초~수 분 걸리므로 페이지 응답을 기다리게 하지 않고 백그라운드에서 돌린다.

export type FbPost = {
  id: string;
  page: string;
  text: string;
  url: string;
  publishedAt: number;
  reactions: number;
  comments: number;
  shares: number;
  score: number;
  image?: string;
};

export type FbStatus = {
  enabled: boolean;
  fetchedAt: number | null;
  ok: boolean;
  error?: string;
  pages: string[];
};

// 기본 대상: 팔로워가 많은 베트남 커뮤니티·연예 페이지 (FB_PAGES 환경변수로 교체 가능, 쉼표 구분)
const DEFAULT_PAGES = [
  "https://www.facebook.com/Theanh28/",
  "https://www.facebook.com/theanh28trendingg/",
  "https://www.facebook.com/beatvn.network/",
];

const ACTOR = "apify~facebook-posts-scraper";
const RUN_TIMEOUT_MS = 280_000;

function config() {
  const pages = (process.env.FB_PAGES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    token: process.env.APIFY_TOKEN ?? "",
    pages: pages.length ? pages : DEFAULT_PAGES,
    refreshMs: Number(process.env.FB_REFRESH_HOURS ?? 6) * 3600_000,
    perPage: Number(process.env.FB_POSTS_PER_PAGE ?? 10),
  };
}

let posts: FbPost[] = [];
let status: FbStatus = { enabled: false, fetchedAt: null, ok: false, pages: [] };
let running: Promise<void> | null = null;

// 저장된 결과를 즉시 돌려주고, 오래됐으면 백그라운드 갱신을 시작한다.
export function getFacebookPosts(): { posts: FbPost[]; status: FbStatus } {
  const cfg = config();
  status = { ...status, enabled: Boolean(cfg.token), pages: cfg.pages };
  if (!cfg.token) return { posts: [], status };

  const stale = !status.fetchedAt || Date.now() - status.fetchedAt > cfg.refreshMs;
  if (stale && !running) {
    running = refresh(cfg).finally(() => {
      running = null;
    });
  }
  return { posts, status };
}

async function refresh(cfg: ReturnType<typeof config>) {
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: cfg.pages.map((url) => ({ url })),
        resultsLimit: cfg.perPage,
        onlyPostsNewerThan: new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10),
      }),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Apify HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const items = (await res.json()) as unknown[];
    posts = items
      .map(normalize)
      .filter((p): p is FbPost => p !== null)
      .sort((a, b) => b.score - a.score);
    status = { ...status, fetchedAt: Date.now(), ok: true, error: undefined };
  } catch (e) {
    // 실패해도 이전 결과는 유지하고, 다음 주기에 다시 시도한다
    status = { ...status, fetchedAt: Date.now(), ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// 수집기 버전에 따라 필드 이름이 다를 수 있어 후보 이름을 차례로 확인한다
export function normalize(raw: unknown): FbPost | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const text = str(o.text) || str(o.message) || str(o.postText);
  const url = str(o.url) || str(o.postUrl) || str(o.topLevelUrl);
  if (!url || !text) return null;

  const user = (o.user ?? {}) as Record<string, unknown>;
  const engagement = (o.engagement ?? {}) as Record<string, unknown>;
  const reactions = num(o.likes) ?? num(o.reactionsCount) ?? num(o.topReactionsCount) ?? num(engagement.reactions) ?? 0;
  const comments = num(o.comments) ?? num(o.commentsCount) ?? num(engagement.comments) ?? 0;
  const shares = num(o.shares) ?? num(o.sharesCount) ?? num(engagement.shares) ?? 0;

  const timeRaw = o.time ?? o.timestamp ?? o.date;
  const t =
    typeof timeRaw === "number" ? (timeRaw < 1e12 ? timeRaw * 1000 : timeRaw) : Date.parse(str(timeRaw));

  const media = Array.isArray(o.media) ? (o.media[0] as Record<string, unknown> | undefined) : undefined;
  const image = str(media?.thumbnail) || str((media?.photo_image as Record<string, unknown> | undefined)?.uri) || undefined;

  return {
    id: str(o.postId) || url,
    page: str(o.pageName) || str(user.name) || "Facebook",
    text: text.length > 400 ? `${text.slice(0, 400)}…` : text,
    url,
    publishedAt: Number.isFinite(t) ? t : Date.now(),
    reactions,
    comments,
    shares,
    // 댓글·공유는 반응보다 참여 강도가 높아 가중치를 둔다
    score: reactions + comments * 2 + shares * 3,
    image,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return undefined;
}
