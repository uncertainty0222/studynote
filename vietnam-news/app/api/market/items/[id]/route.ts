import { deleteItem, STATUSES, updateStatus, type ItemStatus } from "@/lib/market";
import { currentMemberId, isAdmin } from "@/lib/members";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/market/items/:id { status } → 판매중·예약중·판매완료 (작성자·운영자)
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await currentMemberId();
  if (!me) return Response.json({ ok: false, error: "카카오 로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).id);
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };
  if (!Number.isInteger(id) || !status || !(status in STATUSES)) return Response.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  const ok = await updateStatus(id, me, isAdmin(me), status as ItemStatus);
  return Response.json({ ok, error: ok ? undefined : "바꿀 수 없는 글이에요." }, { status: ok ? 200 : 403 });
}

// DELETE /api/market/items/:id → 글 삭제 (작성자·운영자)
export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await currentMemberId();
  if (!me) return Response.json({ ok: false, error: "카카오 로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  const ok = await deleteItem(id, me, isAdmin(me));
  return Response.json({ ok, error: ok ? undefined : "지울 수 없는 글이에요." }, { status: ok ? 200 : 403 });
}
