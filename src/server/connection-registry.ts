/**
 * Connection Registry
 *
 * Maps session IDs to a set of WebSocket connections and the shared runtime.
 * The runtime lives independently of any single connection — it persists
 * across reconnects and even across browser tabs observing the same session.
 *
 * When the last connection for a session disconnects, the runtime is kept
 * alive for a grace period (SESSION_KEEPALIVE_MS) before disposal, so a
 * quick reconnect doesn't recreate everything.
 */

import type WebSocket from "ws";
import { EventRing } from "./event-ring.js";

const SESSION_KEEPALIVE_MS = 30_000;

export interface SessionSlot {
  runtime: { dispose: () => Promise<void> };
  connections: Set<WebSocket>;
  eventRing: EventRing;
  keepaliveTimer?: ReturnType<typeof setTimeout>;
}

export class ConnectionRegistry {
  private slots = new Map<string, SessionSlot>();
  private fileToId = new Map<string, string>(); // sessionFile → sessionId
  private disposals = new Map<string, Promise<void>>();

  /** Register a new session runtime and create its slot. */
  register(sessionId: string, runtime: SessionSlot["runtime"]): SessionSlot {
    // Cancel any pending disposal
    this.cancelKeepalive(sessionId);

    const existing = this.slots.get(sessionId);
    if (existing) {
      existing.runtime = runtime;
      return existing;
    }

    const slot: SessionSlot = {
      runtime,
      connections: new Set(),
      eventRing: new EventRing(),
    };
    this.slots.set(sessionId, slot);
    return slot;
  }

  /** Attach a WebSocket connection to a session. Returns the slot or null. */
  attach(sessionId: string, ws: WebSocket): SessionSlot | null {
    const slot = this.slots.get(sessionId);
    if (!slot) return null;
    this.cancelKeepalive(sessionId);
    slot.connections.add(ws);
    return slot;
  }

  /** Detach a WebSocket from a session. Cleans up if last connection. */
  detach(sessionId: string, ws: WebSocket): void {
    const slot = this.slots.get(sessionId);
    if (!slot) return;
    slot.connections.delete(ws);

    if (slot.connections.size === 0) {
      // Schedule disposal
      if (slot.keepaliveTimer) clearTimeout(slot.keepaliveTimer);
      slot.keepaliveTimer = setTimeout(() => {
        this.dispose(sessionId);
      }, SESSION_KEEPALIVE_MS);
    }
  }

  /** Broadcast an event to all connections for a session. */
  broadcast(sessionId: string, event: Record<string, unknown>): void {
    const slot = this.slots.get(sessionId);
    if (!slot) return;
    const payload = JSON.stringify(event);
    for (const ws of slot.connections) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    }
  }

  /** Get a slot if it exists. */
  get(sessionId: string): SessionSlot | undefined {
    return this.slots.get(sessionId);
  }

  /** Look up a slot by session file path. */
  getByFile(sessionFile: string): SessionSlot | undefined {
    const id = this.fileToId.get(sessionFile);
    if (!id) return undefined;
    return this.slots.get(id);
  }

  /** Map a session file path to its session ID. */
  mapFile(sessionFile: string, sessionId: string): void {
    this.fileToId.set(sessionFile, sessionId);
  }

  /** Check if a session has active connections. */
  hasConnections(sessionId: string): boolean {
    const slot = this.slots.get(sessionId);
    if (!slot) return false;
    return slot.connections.size > 0;
  }

  /** Dispose a session and remove it from the registry. */
  private async dispose(sessionId: string): Promise<void> {
    const slot = this.slots.get(sessionId);
    if (!slot) return;
    if (slot.connections.size > 0) return; // Still connected, don't dispose

    this.slots.delete(sessionId);
    // Clean up file→id mappings
    for (const [file, id] of this.fileToId) {
      if (id === sessionId) this.fileToId.delete(file);
    }
    if (slot.keepaliveTimer) clearTimeout(slot.keepaliveTimer);

    try {
      await slot.runtime.dispose();
    } catch {
      // Ignore disposal errors
    }
  }

  private cancelKeepalive(sessionId: string): void {
    const slot = this.slots.get(sessionId);
    if (slot?.keepaliveTimer) {
      clearTimeout(slot.keepaliveTimer);
      slot.keepaliveTimer = undefined;
    }
  }

  /** Dispose all sessions (for server shutdown). */
  async disposeAll(): Promise<void> {
    const ids = [...this.slots.keys()];
    await Promise.allSettled(ids.map((id) => this.dispose(id)));
  }
}
