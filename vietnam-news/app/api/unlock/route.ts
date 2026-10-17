import { cookies } from "next/headers";
import { COOKIE_MAX_AGE, makeCookieValue, PREMIUM_COOKIE, redeem } from "@/lib/premium";

export const dynamic = "force-dynamic";

// POST /api/unlock  { code }  → 맞으면 이용권 쿠키를 심는다
export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const info = code ? redeem(code) : null;
  if (!info) {
    await new Promise((r) => setTimeout(r, 800)); // 코드 무작위 대입을 늦춘다
    return Response.json({ ok: false, error: "이용권 코드가 맞지 않거나 기간이 지났습니다." }, { status: 400 });
  }
  (await cookies()).set(PREMIUM_COOKIE, makeCookieValue(info.code), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return Response.json({ ok: true, expiresAt: info.expiresAt });
}

// DELETE /api/unlock → 이 기기에서 이용권 해제
export async function DELETE() {
  (await cookies()).delete(PREMIUM_COOKIE);
  return Response.json({ ok: true });
}
