import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST /api/auth/logout → 이 기기에서 로그아웃
export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
