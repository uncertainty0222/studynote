import { isDbConfigured } from "@/lib/db";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  if (!isDbConfigured()) {
    return Response.json({ error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    const publicKey = await getVapidPublicKey();
    return Response.json({ publicKey });
  } catch {
    return Response.json({ error: "PUSH_ERROR" }, { status: 500 });
  }
}
