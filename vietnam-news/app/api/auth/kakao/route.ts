import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { kakaoAuthorizeUrl, loginEnabled } from "@/lib/members";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "vn_oauth_state";

// GET /api/auth/kakao → 카카오 로그인 화면으로 보낸다
export async function GET(req: Request) {
  if (!loginEnabled()) return NextResponse.json({ error: "로그인이 아직 설정되지 않았습니다" }, { status: 503 });
  // 다른 사이트가 로그인 결과를 끼워 넣지 못하도록 임의값을 쿠키에 두고 돌아올 때 대조한다
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(kakaoAuthorizeUrl(req, state));
  // 멤버십 안내에서 눌렀으면 돌아와서 신청 화면을 다시 연다
  const next = new URL(req.url).searchParams.get("next") === "pro" ? "pro" : "ok";
  res.cookies.set("vn_oauth_next", next, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
