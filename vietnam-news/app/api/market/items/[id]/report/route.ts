import { reportItem } from "@/lib/market";
import { currentMemberId } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST /api/market/items/:id/report { reason } → 신고 (서로 다른 3명이면 자동 숨김)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMemberId();
  if (!me) return Response.json({ ok: false, error: "카카오 로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).id);
  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };
  if (!Number.isInteger(id)) return Response.json({ ok: false }, { status: 400 });
  await reportItem(id, me, reason ?? "");
  return Response.json({ ok: true });
}
