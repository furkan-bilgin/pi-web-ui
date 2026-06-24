import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { ConnectionManager, type MessageHandler } from "./connection";
import type { ConnectionStatus } from "../types";

interface ConnectionContextValue {
  status: ConnectionStatus;
  send: (payload: Record<string, unknown>) => void;
  setHandler: (handler: MessageHandler) => void;
  lastSeq: number | null;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const connRef = useRef<ConnectionManager | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const handlerRef = useRef<MessageHandler | null>(null);

  // Create connection manager once
  if (!connRef.current) {
    connRef.current = new ConnectionManager();
  }

  useEffect(() => {
    const conn = connRef.current!;

    conn.setOnStatusChange(setStatus);

    // Read session ID from URL hash (#s-{sessionId}) with fallback to
    // localStorage.  Only the session ID (UUID) is exposed in the URL -
    // no filesystem paths.
    const hashSessionId =
      location.hash.startsWith("#s-")
        ? decodeURIComponent(location.hash.slice(3))
        : null;
    const storedSessionId = (() => {
      try {
        return localStorage.getItem("pi-web-ui:session-id");
      } catch {
        return null;
      }
    })();
    const resumeSessionId = hashSessionId || storedSessionId || null;

    conn.setHandler((packet) => {
      handlerRef.current?.(packet);
    });

    conn.connect(resumeSessionId);

    return () => {
      conn.disconnect();
    };
  }, []);

  const send = useCallback((payload: Record<string, unknown>) => {
    connRef.current?.send(payload);
  }, []);

  const setHandler = useCallback((handler: MessageHandler) => {
    handlerRef.current = handler;
  }, []);

  return (
    <ConnectionContext.Provider
      value={{
        status,
        send,
        setHandler,
        lastSeq: connRef.current?.lastSeq ?? null,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error("useConnection must be used within ConnectionProvider");
  }
  return ctx;
}
