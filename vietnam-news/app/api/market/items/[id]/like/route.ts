import { toggleLike } from "@/lib/market";
import { currentMemberId } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST /api/market/items/:id/like → 관심 추가/해제
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMemberId();
  if (!me) return Response.json({ ok: false, error: "카카오 로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ ok: false }, { status: 400 });
  return Response.json({ ok: true, liked: await toggleLike(id, me) });
}
