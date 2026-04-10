// In-memory SSE client registry (works on single Railway instance)
const encoder = new TextEncoder();
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

export function addSseClient(ctrl: ReadableStreamDefaultController<Uint8Array>) {
  clients.add(ctrl);
}

export function removeSseClient(ctrl: ReadableStreamDefaultController<Uint8Array>) {
  clients.delete(ctrl);
}

export function broadcastUpdate() {
  const dead: ReadableStreamDefaultController<Uint8Array>[] = [];
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(encoder.encode('data: update\n\n'));
    } catch {
      dead.push(ctrl);
    }
  }
  for (const ctrl of dead) clients.delete(ctrl);
}
