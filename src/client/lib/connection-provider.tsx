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

    // Read session file from URL hash
    const hashSession =
      location.hash.startsWith("#")
        ? decodeURIComponent(location.hash.slice(1))
        : null;
    const storedSession = (() => {
      try {
        return localStorage.getItem("pi-web-ui:session-file");
      } catch {
        return null;
      }
    })();
    const resumeFile = hashSession || storedSession || null;

    conn.setHandler((packet) => {
      handlerRef.current?.(packet);
    });

    conn.connect(resumeFile);

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
