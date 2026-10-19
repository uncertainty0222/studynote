import {
  currentMemberId,
  getMember,
  loginEnabled,
  markApprovalSeen,
  notifyOperator,
  requestMembership,
  siteUrl,
} from "@/lib/members";

export const dynamic = "force-dynamic";

const sessionId = currentMemberId;

// GET /api/membership → 승인 대기 중인 화면이 승인됐는지 확인할 때
export async function GET() {
  const id = await sessionId();
  if (!id) return Response.json({ ok: false }, { status: 401 });
  const m = await getMember(id);
  return Response.json({ ok: true, pending: m?.pending ?? false, premiumUntil: m?.premiumUntil ?? null });
}

// POST /api/membership { payerName } → "송금했어요": 승인 대기 요청을 남기고 운영자에게 알린다
// POST /api/membership { seen: true } → '멤버십이 열렸어요' 안내를 봤다
export async function POST(req: Request) {
  if (!loginEnabled()) return Response.json({ ok: false, error: "결제가 아직 설정되지 않았습니다." }, { status: 503 });
  const id = await sessionId();
  if (!id) return Response.json({ ok: false, error: "카카오 로그인이 필요합니다." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { payerName?: string; seen?: boolean };

  if (body.seen) {
    await markApprovalSeen(id);
    return Response.json({ ok: true });
  }
  if (!body.payerName?.trim()) return Response.json({ ok: false, error: "송금한 분의 이름을 적어 주세요." }, { status: 400 });
  await requestMembership(id, body.payerName);

  const m = await getMember(id);
  await notifyOperator(
    `🍜 주간베트남 멤버십 신청\n보낸 분: ${body.payerName.trim().slice(0, 40)}\n카카오: ${m?.nickname || id}${m?.alias ? ` (${m.alias})` : ""}\n\n입금 확인 후 승인: ${siteUrl(req)}/admin`,
  );
  return Response.json({ ok: true });
}
