import { getFlightCard } from "@/lib/flights";

export const dynamic = "force-dynamic";

// GET /api/flights → 한국 → 나트랑 편도 최저가와 최근 7일 추이
export async function GET() {
  return Response.json(await getFlightCard());
}
