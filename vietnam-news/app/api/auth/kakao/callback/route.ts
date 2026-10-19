import { NextResponse } from "next/server";
import {
  deleteMember,
  kakaoUnlink,
  kakaoUserFromCode,
  loginEnabled,
  makeSession,
  readSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  siteUrl,
  upsertMember,
  WITHDRAW_COOKIE,
} from "@/lib/members";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "vn_oauth_state";

const cookieOf = (req: Request, name: string) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];

// GET /api/auth/kakao/callback?code=...&state=... → 회원 저장, 로그인 쿠키, 첫 화면으로
// (탈퇴 요청이면 카카오 연결을 끊고 회원 정보를 지운다)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const home = siteUrl(req);
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${home}/?login=${reason}`);
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(WITHDRAW_COOKIE);
    return res;
  };
  if (!loginEnabled()) return fail("off");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return fail("cancel"); // 동의 화면에서 취소
  if (!state || state !== cookieOf(req, STATE_COOKIE)) return fail("state");
  const next = cookieOf(req, "vn_oauth_next")?.match(/^(pro|market|withdraw)$/)?.[1] ?? "ok";

  let user: { id: string; nickname: string; accessToken: string };
  try {
    user = await kakaoUserFromCode(req, code);
  } catch (e) {
    console.error("[kakao login]", e);
    return fail("error");
  }

  if (next === "withdraw") {
    // 내 정보 화면에서 탈퇴를 누른 그 회원 본인일 때만 (다른 카카오 계정으로 바뀌었거나, 링크만 열린 경우는 거절)
    const asked = readSession(cookieOf(req, SESSION_COOKIE));
    if (!asked || asked !== user.id || cookieOf(req, WITHDRAW_COOKIE) !== asked) return fail("withdraw_denied");
    try {
      await kakaoUnlink(user.accessToken);
      await deleteMember(user.id);
    } catch (e) {
      console.error("[withdraw]", e);
      return fail("withdraw_error");
    }
    const res = NextResponse.redirect(`${home}/?login=bye`);
    for (const c of [STATE_COOKIE, WITHDRAW_COOKIE, "vn_oauth_next", SESSION_COOKIE]) res.cookies.delete(c);
    return res;
  }

  let isNew = false;
  try {
    isNew = (await upsertMember(user.id, user.nickname)).isNew;
  } catch (e) {
    console.error("[kakao login]", e);
    return fail("error");
  }

  // 처음 가입했으면 별명 소개 화면을 거쳐 원래 가려던 곳으로
  const dest = next === "market" ? "/market" : `/?login=${next}`;
  const res = NextResponse.redirect(isNew ? `${home}/welcome?next=${encodeURIComponent(dest)}` : `${home}${dest}`);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete("vn_oauth_next");
  res.cookies.set(SESSION_COOKIE, makeSession(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
