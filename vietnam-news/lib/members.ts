// 카카오 로그인 회원과 멤버십 (카카오페이 송금 → 운영자 승인 → 30일).
// 카카오페이 자동 결제(API)는 가맹점 계약(사업자)이 있어야 해서, 송금을 운영자가 확인하고 승인하는 방식이다.
//
// KAKAO_REST_API_KEY   : Kakao Developers 앱의 REST API 키
// KAKAO_CLIENT_SECRET  : 앱에서 Client Secret을 켰을 때만
// SITE_URL             : 사이트 주소 (예: https://xxx.up.railway.app). 카카오 Redirect URI = SITE_URL + /api/auth/kakao/callback
// ADMIN_KAKAO_IDS      : 운영자 카카오 회원번호 (쉼표 구분). /admin 에서 승인할 수 있다
// SESSION_SECRET       : 로그인 쿠키 서명용 긴 임의 문자열 (없으면 PREMIUM_SECRET을 쓴다)
// TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID : 있으면 '송금했어요' 신청이 올 때 운영자 텔레그램으로 알린다

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { dbEnabled, query } from "./db";

export const SESSION_COOKIE = "vn_session";
export const SESSION_MAX_AGE = 180 * 24 * 3600;
export const MEMBERSHIP_DAYS = 30;

const G = globalThis as unknown as { __vnSessionSecret?: string };
function secret() {
  return process.env.SESSION_SECRET || process.env.PREMIUM_SECRET || (G.__vnSessionSecret ??= randomBytes(32).toString("hex"));
}

export function loginEnabled() {
  return dbEnabled() && Boolean(process.env.KAKAO_REST_API_KEY);
}

// ── 로그인 쿠키: "카카오 회원번호.만료시각.서명" ─────────
function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function makeSession(kakaoId: string) {
  const v = `${kakaoId}.${Date.now() + SESSION_MAX_AGE * 1000}`;
  return `${v}.${sign(v)}`;
}

export function readSession(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (!/^\d+$/.test(id) || Date.now() > Number(exp)) return null;
  return id;
}

// ── 카카오 OAuth ─────────────────────────
export function siteUrl(req: Request) {
  return siteUrlFromHeaders(req.headers);
}

export function siteUrlFromHeaders(h: Headers) {
  const env = process.env.SITE_URL?.trim();
  if (env) {
    // "xxx.up.railway.app", "https://xxx.up.railway.app/" 처럼 넣어도 https://호스트 형태로 맞춘다
    try {
      return new URL(/^https?:\/\//i.test(env) ? env : `https://${env}`).origin;
    } catch {}
  }
  // Railway 프록시 뒤에서는 원래 호스트가 x-forwarded-* 에 담겨 온다
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export function kakaoRedirectUri(req: Request) {
  return `${siteUrl(req)}/api/auth/kakao/callback`;
}

export function kakaoAuthorizeUrl(req: Request, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    redirect_uri: kakaoRedirectUri(req),
    response_type: "code",
    state,
  });
  return `https://kauth.kakao.com/oauth/authorize?${p}`;
}

export async function kakaoUserFromCode(req: Request, code: string): Promise<{ id: string; nickname: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    redirect_uri: kakaoRedirectUri(req),
    code,
  });
  if (process.env.KAKAO_CLIENT_SECRET) body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenRes.ok || !token.access_token) throw new Error(`카카오 토큰 발급 실패: ${token.error_description ?? tokenRes.status}`);

  const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const me = (await meRes.json()) as {
    id?: number | string;
    properties?: { nickname?: string };
    kakao_account?: { profile?: { nickname?: string } };
  };
  if (!meRes.ok || me.id == null) throw new Error(`카카오 사용자 정보 조회 실패: ${meRes.status}`);
  // 회원번호는 숫자가 커서 문자열로 다룬다
  const nickname = me.kakao_account?.profile?.nickname ?? me.properties?.nickname ?? "";
  return { id: String(me.id), nickname };
}

// ── 회원·멤버십 ─────────────────────────
export type Member = {
  id: string;
  nickname: string;
  premiumUntil: number | null;
  pending: boolean; // 승인을 기다리는 송금 확인 요청이 있는지
  justApproved: boolean; // 승인됐는데 아직 '멤버십이 열렸어요' 안내를 못 봤는지
  admin: boolean;
};

export function isAdmin(kakaoId: string) {
  return (process.env.ADMIN_KAKAO_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(kakaoId);
}

export async function upsertMember(id: string, nickname: string) {
  await query(
    `insert into members (kakao_id, nickname) values ($1, $2)
     on conflict (kakao_id) do update set nickname = excluded.nickname, last_login_at = now()`,
    [id, nickname],
  );
}

export async function getMember(id: string): Promise<Member | null> {
  const rows = await query<{ nickname: string; premium_until: Date | null; pending: boolean; just_approved: boolean }>(
    `select nickname, premium_until,
       exists(select 1 from payment_requests p where p.kakao_id = m.kakao_id and p.status = 'pending') as pending,
       exists(select 1 from payment_requests p where p.kakao_id = m.kakao_id and p.status = 'approved' and not p.seen) as just_approved
     from members m where kakao_id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  return {
    id,
    nickname: rows[0].nickname,
    premiumUntil: rows[0].premium_until ? rows[0].premium_until.getTime() : null,
    pending: rows[0].pending,
    justApproved: rows[0].just_approved,
    admin: isAdmin(id),
  };
}

// 송금했다고 알리면 승인 대기 요청을 남긴다 (대기 중인 요청이 있으면 입금자명만 고친다)
export async function requestMembership(id: string, payerName: string) {
  const name = payerName.trim().slice(0, 40);
  const updated = await query(
    `update payment_requests set payer_name = $2, created_at = now() where kakao_id = $1 and status = 'pending' returning id`,
    [id, name],
  );
  if (updated.length === 0) {
    await query(`insert into payment_requests (kakao_id, payer_name) values ($1, $2)`, [id, name]);
  }
}

export async function markApprovalSeen(id: string) {
  await query(`update payment_requests set seen = true where kakao_id = $1 and status = 'approved' and not seen`, [id]);
}

// 운영자 텔레그램 알림. 실패해도 신청 자체는 막지 않는다
export async function notifyOperator(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) console.error("[telegram]", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[telegram]", e);
  }
}

export type PaymentRequest = {
  id: number;
  kakaoId: string;
  nickname: string;
  payerName: string;
  status: string;
  createdAt: number;
  premiumUntil: number | null;
};

export async function listRequests(): Promise<PaymentRequest[]> {
  const rows = await query<{
    id: number;
    kakao_id: string;
    nickname: string;
    payer_name: string;
    status: string;
    created_at: Date;
    premium_until: Date | null;
  }>(
    `select p.id, p.kakao_id::text, m.nickname, p.payer_name, p.status, p.created_at, m.premium_until
     from payment_requests p join members m using (kakao_id)
     order by (p.status = 'pending') desc, p.created_at desc limit 100`,
  );
  return rows.map((r) => ({
    id: r.id,
    kakaoId: r.kakao_id,
    nickname: r.nickname,
    payerName: r.payer_name,
    status: r.status,
    createdAt: r.created_at.getTime(),
    premiumUntil: r.premium_until ? r.premium_until.getTime() : null,
  }));
}

// 승인: 남은 기간이 있으면 그 뒤로 30일, 없으면 지금부터 30일
export async function decideRequest(requestId: number, approve: boolean) {
  const rows = await query<{ kakao_id: string }>(
    `update payment_requests set status = $2, decided_at = now() where id = $1 and status = 'pending' returning kakao_id::text`,
    [requestId, approve ? "approved" : "rejected"],
  );
  if (!rows[0] || !approve) return Boolean(rows[0]);
  await query(
    `update members set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => $2)
     where kakao_id = $1`,
    [rows[0].kakao_id, MEMBERSHIP_DAYS],
  );
  return true;
}
