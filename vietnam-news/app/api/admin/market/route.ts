import { clearSamples, deleteItem, insertSamples, restoreItem } from "@/lib/market";
import { SAMPLE_ITEMS, samplePhotos } from "@/lib/market-samples";
import { currentMemberId, isAdmin } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST /api/admin/market { id, action: "restore" | "delete" } → 신고된 장터 글 처리 (운영자)
// POST /api/admin/market { action: "seed" | "clearSeed" } → 테스트 글 5개 넣기·지우기
export async function POST(req: Request) {
  const me = await currentMemberId();
  if (!me || !isAdmin(me)) return Response.json({ ok: false, error: "운영자만 할 수 있습니다." }, { status: 403 });
  const { id, action } = (await req.json().catch(() => ({}))) as { id?: number; action?: string };
  // 테스트 글 5개 넣기·지우기
  if (action === "seed") {
    await insertSamples(me, SAMPLE_ITEMS, await samplePhotos());
    return Response.json({ ok: true });
  }
  if (action === "clearSeed") return Response.json({ ok: true, removed: await clearSamples() });
  if (!Number.isInteger(id)) return Response.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  if (action === "restore") await restoreItem(id!);
  else if (action === "delete") await deleteItem(id!, me, true);
  else return Response.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  return Response.json({ ok: true });
}
