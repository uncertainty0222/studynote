import { currentMemberId, rerollProfile } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST /api/account/profile → 별명·프로필 그림 다시 뽑기
export async function POST() {
  const id = await currentMemberId();
  if (!id) return Response.json({ ok: false, error: "카카오 로그인이 필요합니다." }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await rerollProfile(id)) });
  } catch (e) {
    console.error("[reroll]", e);
    return Response.json({ ok: false, error: "다시 뽑지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
