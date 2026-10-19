import { getImage } from "@/lib/market";

export const dynamic = "force-dynamic";

// GET /api/market/images/:id?size=thumb|full → JPEG (사진은 바뀌지 않으므로 오래 캐시)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
  const data = Number.isInteger(id) ? await getImage(id, size) : null;
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
