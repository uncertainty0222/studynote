import { cookies } from "next/headers";
import { accessFromCookie, PREMIUM_COOKIE } from "@/lib/premium";
import { getRanking, PERIODS, SCOPES, type PeriodId, type ScopeId } from "@/lib/rankings";

export const dynamic = "force-dynamic";

// GET /api/rankings?scope=national&period=week
// 이용권이 없으면 주간 1~10위만 내려준다
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const scope = params.get("scope") as ScopeId;
  const period = params.get("period") as PeriodId;
  if (!(scope in SCOPES) || !(period in PERIODS)) {
    return Response.json({ error: "scope 또는 period 값이 올바르지 않습니다" }, { status: 400 });
  }
  const { premium } = accessFromCookie((await cookies()).get(PREMIUM_COOKIE)?.value);
  return Response.json(getRanking(scope, period, premium));
}
