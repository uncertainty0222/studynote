import { isDbConfigured, upsertPushSubscription, deletePushSubscription } from "@/lib/db";

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return Response.json({ error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    const sub = await request.json() as Record<string, unknown>;
    await upsertPushSubscription(sub.endpoint as string, sub);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "SUBSCRIBE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isDbConfigured()) {
    return Response.json({ error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    const { endpoint } = await request.json() as { endpoint: string };
    await deletePushSubscription(endpoint);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "UNSUBSCRIBE_FAILED" }, { status: 500 });
  }
}
