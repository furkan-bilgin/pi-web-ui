/**
 * WebSocket Connection Manager
 *
 * Manages the WebSocket connection to the pi-web-ui server with:
 * - Exponential backoff reconnection
 * - Heartbeat (ping/pong)
 * - Session replay cursor tracking
 * - Clean disconnect
 */

import type { ConnectionStatus } from "../types";

export type MessageHandler = (packet: { type: string; [key: string]: unknown }) => void;

const BASE_DELAY = 500;
const MAX_DELAY = 30_000;
const PING_INTERVAL = 30_000;
const PONG_TIMEOUT = 60_000;

export class ConnectionManager {
  private socket: WebSocket | null = null;
  private url: string;
  private handler: MessageHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private delay = BASE_DELAY;
  private _status: ConnectionStatus = "disconnected";
  private _lastSeq: number | null = null;
  private sessionFile: string | null = null;
  private intentionalClose = false;
  private onStatusChange: ((status: ConnectionStatus) => void) | null = null;

  constructor() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    // Derive WebSocket path from the page URL so it works behind a base path.
    // e.g. page at /chat/ → WS at /chat/ws
    const base = window.location.pathname.replace(/\/+$/, "");
    const wsPath = base ? `${base}/ws` : "/ws";
    this.url = `${protocol}://${host}${wsPath}`;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get lastSeq(): number | null {
    return this._lastSeq;
  }

  setHandler(handler: MessageHandler): void {
    this.handler = handler;
  }

  setOnStatusChange(cb: (status: ConnectionStatus) => void): void {
    this.onStatusChange = cb;
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    this.onStatusChange?.(status);
  }

  connect(sessionFile?: string | null): void {
    this.intentionalClose = false;
    this.sessionFile = sessionFile ?? this.sessionFile;
    this.setStatus("connecting");

    try {
      this.socket = new WebSocket(this.url);
    } catch (err) {
      console.error("[ws] failed to create WebSocket:", err);
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => {
      console.info("[ws] connected", {
        lastSeq: this._lastSeq,
        sessionFile: this.sessionFile,
      });
      this.delay = BASE_DELAY;
      this.setStatus("connected");
      this.startPing();

      // Send ready handshake
      this.send({
        type: "ready",
        lastSeq: this._lastSeq,
        sessionFile: this.sessionFile,
      });
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const packet = JSON.parse(event.data);
        this.handlePacket(packet);
      } catch (err) {
        console.error("[ws] parse error:", err);
      }
    });

    this.socket.addEventListener("close", (event) => {
      // Ignore close events from old sockets (e.g. after StrictMode cleanup
      // followed by a new connect()). Without this guard, the old socket's
      // async close event fires after intentionalClose has been reset by
      // the new connect() call, spawning a duplicate connection.
      if (event.target !== this.socket) return;

      console.warn("[ws] closed", { code: event.code, reason: event.reason });
      this.stopPing();
      this.setStatus("disconnected");

      if (!this.intentionalClose) {
        this.setStatus("reconnecting");
        this.scheduleReconnect();
      }
    });

    this.socket.addEventListener("error", () => {
      console.error("[ws] error");
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopPing();
    this.clearReconnect();
    if (this.socket) {
      this.socket.close(1000, "client disconnect");
      this.socket = null;
    }
    this.setStatus("disconnected");
  }

  send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    } else {
      console.warn("[ws] cannot send, not connected");
    }
  }

  updateSessionFile(file: string | null): void {
    this.sessionFile = file;
  }

  /** Call from the dispatch layer when we receive a session_event with a seq. */
  setLastSeq(seq: number): void {
    this._lastSeq = seq;
  }

  // ── Private ──

  private handlePacket(packet: { type: string; [key: string]: unknown }): void {
    switch (packet.type) {
      case "connected": {
        this.setStatus("connected");
        break;
      }
      case "ping": {
        this.send({ type: "pong" });
        return; // Don't forward ping to handler
      }
      case "pong": {
        // Clear the pong timeout — the server is alive.
        if (this.pongTimer) {
          clearTimeout(this.pongTimer);
          this.pongTimer = null;
        }
        return; // Don't forward pong to handler
      }
      case "session_event": {
        if (typeof packet.seq === "number") {
          this._lastSeq = packet.seq as number;
        }
        break;
      }
      case "session_reset":
      case "replay_done": {
        const p = packet as unknown as { payload?: { currentSeq?: number } };
        if (typeof p.payload?.currentSeq === "number") {
          this._lastSeq = p.payload.currentSeq;
        }
        break;
      }
    }

    // Forward to the registered handler
    this.handler?.(packet);
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    console.info(`[ws] reconnect in ${this.delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.delay = Math.min(this.delay * 2, MAX_DELAY);
      this.connect();
    }, this.delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" });
      // Set a timeout for the pong
      this.pongTimer = setTimeout(() => {
        console.warn("[ws] pong timeout, closing");
        this.socket?.close(4000, "pong timeout");
      }, PONG_TIMEOUT);
    }, PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }
}
