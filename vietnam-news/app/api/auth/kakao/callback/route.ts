import { NextResponse } from "next/server";
import { kakaoUserFromCode, loginEnabled, makeSession, SESSION_COOKIE, SESSION_MAX_AGE, siteUrl, upsertMember } from "@/lib/members";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "vn_oauth_state";

// GET /api/auth/kakao/callback?code=...&state=... → 회원 저장, 로그인 쿠키, 첫 화면으로
export async function GET(req: Request) {
  const url = new URL(req.url);
  const home = siteUrl(req);
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${home}/?login=${reason}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  if (!loginEnabled()) return fail("off");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = req.headers.get("cookie")?.match(/(?:^|;\s*)vn_oauth_state=([^;]+)/)?.[1];
  if (!code) return fail("cancel"); // 동의 화면에서 취소
  if (!state || state !== saved) return fail("state");

  let user: { id: string; nickname: string };
  try {
    user = await kakaoUserFromCode(req, code);
    await upsertMember(user.id, user.nickname);
  } catch (e) {
    console.error("[kakao login]", e);
    return fail("error");
  }

  const next = req.headers.get("cookie")?.match(/(?:^|;\s*)vn_oauth_next=(pro)/)?.[1] ?? "ok";
  const res = NextResponse.redirect(`${home}/?login=${next}`);
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
