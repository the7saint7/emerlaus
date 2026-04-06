import type { Response } from "express";

const connections = new Map<string, Set<Response>>();

export function addSseConnection(instanceId: string, res: Response): () => void {
  let set = connections.get(instanceId);
  if (set == null) {
    set = new Set();
    connections.set(instanceId, set);
  }

  set.add(res);

  return () => {
    set!.delete(res);
    if (set!.size === 0) {
      connections.delete(instanceId);
    }
  };
}

export function notifyMatchUpdated(instanceId: string): void {
  const set = connections.get(instanceId);
  if (set == null || set.size === 0) {
    return;
  }

  const payload = `data: ${JSON.stringify({ type: "state_updated" })}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      // Connection already closed; the "close" event handler will clean it up
    }
  }
}

export function broadcastCursorMove(instanceId: string, seatNumber: number, targetSeatNumber: number | null): void {
  const set = connections.get(instanceId);
  if (set == null || set.size === 0) {
    return;
  }

  const payload = `data: ${JSON.stringify({ type: "cursor_move", seatNumber, targetSeatNumber })}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      // Connection already closed
    }
  }
}
