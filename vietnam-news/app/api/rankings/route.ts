import { getRanking, PERIODS, SCOPES, type PeriodId, type ScopeId } from "@/lib/rankings";

export const dynamic = "force-dynamic";

// GET /api/rankings?scope=national&period=week
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const scope = params.get("scope") as ScopeId;
  const period = params.get("period") as PeriodId;
  if (!(scope in SCOPES) || !(period in PERIODS)) {
    return Response.json({ error: "scope 또는 period 값이 올바르지 않습니다" }, { status: 400 });
  }
  return Response.json(getRanking(scope, period));
}
