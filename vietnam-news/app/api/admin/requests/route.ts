import { cookies } from "next/headers";
import { decideRequest, isAdmin, loginEnabled, readSession, SESSION_COOKIE } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST /api/admin/requests { id, approve } → 운영자가 송금을 확인하고 승인(30일) 또는 거절
export async function POST(req: Request) {
  const id = loginEnabled() ? readSession((await cookies()).get(SESSION_COOKIE)?.value) : null;
  if (!id || !isAdmin(id)) return Response.json({ ok: false, error: "운영자만 할 수 있습니다." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: number; approve?: boolean };
  if (!Number.isInteger(body.id) || typeof body.approve !== "boolean") {
    return Response.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const done = await decideRequest(body.id!, body.approve);
  return Response.json({ ok: done, error: done ? undefined : "이미 처리된 요청입니다." });
}
