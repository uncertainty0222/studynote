import { getAuthUser } from '@/lib/auth';
import { addSseClient, removeSseClient } from '@/lib/broadcast';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let ctrl!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      addSseClient(c);
      c.enqueue(encoder.encode('data: connected\n\n'));
    },
    cancel() {
      removeSseClient(ctrl);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
