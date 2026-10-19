import { cookies } from "next/headers";
import { currentMemberId, WITHDRAW_COOKIE } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST /api/account/withdraw → 탈퇴 표시를 남기고, 카카오로 본인 확인을 받으러 보낸다
// (실제 삭제는 카카오 로그인 콜백에서. 링크만 눌러서는 탈퇴되지 않도록 이 POST를 거쳐야 한다)
export async function POST() {
  const id = await currentMemberId();
  if (!id) return Response.json({ ok: false, error: "카카오 로그인이 필요합니다." }, { status: 401 });
  (await cookies()).set(WITHDRAW_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return Response.json({ ok: true, url: "/api/auth/kakao?next=withdraw" });
}
