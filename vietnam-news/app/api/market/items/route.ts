import { createItem, DAILY_POST_LIMIT, MAX_PHOTOS, postsToday, validateItem, type NewItem } from "@/lib/market";
import { currentMemberId } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST /api/market/items (FormData: title, description, price, category, area, contact, photo0..4, thumb0..4)
export async function POST(req: Request) {
  const me = await currentMemberId();
  if (!me) return Response.json({ ok: false, error: "카카오 로그인이 필요해요." }, { status: 401 });
  if ((await postsToday(me)) >= DAILY_POST_LIMIT) {
    return Response.json({ ok: false, error: `글은 하루 ${DAILY_POST_LIMIT}개까지 올릴 수 있어요.` }, { status: 429 });
  }
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ ok: false, error: "잘못된 요청" }, { status: 400 });

  const text = (k: string) => String(form.get(k) ?? "");
  const photos: NewItem["photos"] = [];
  for (let i = 0; i < MAX_PHOTOS; i++) {
    const full = form.get(`photo${i}`);
    const thumb = form.get(`thumb${i}`);
    if (!(full instanceof Blob) || !(thumb instanceof Blob)) continue;
    photos.push({ full: Buffer.from(await full.arrayBuffer()), thumb: Buffer.from(await thumb.arrayBuffer()) });
  }
  const item: NewItem = {
    title: text("title"),
    description: text("description"),
    price: Number(text("price").replace(/[^\d]/g, "") || "0"),
    category: text("category"),
    area: text("area"),
    contact: text("contact"),
    photos,
  };
  const error = validateItem(item);
  if (error) return Response.json({ ok: false, error }, { status: 400 });
  const id = await createItem(me, item);
  return Response.json({ ok: true, id });
}
