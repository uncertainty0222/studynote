import { cookies } from "next/headers";
import { loginEnabled, readSession, requestMembership, SESSION_COOKIE } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST /api/membership { payerName } → "송금했어요": 운영자 승인 대기 요청을 남긴다
export async function POST(req: Request) {
  if (!loginEnabled()) return Response.json({ ok: false, error: "결제가 아직 설정되지 않았습니다." }, { status: 503 });
  const id = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return Response.json({ ok: false, error: "카카오 로그인이 필요합니다." }, { status: 401 });
  const { payerName } = (await req.json().catch(() => ({}))) as { payerName?: string };
  if (!payerName?.trim()) return Response.json({ ok: false, error: "송금한 분의 이름을 적어 주세요." }, { status: 400 });
  await requestMembership(id, payerName);
  return Response.json({ ok: true });
}
