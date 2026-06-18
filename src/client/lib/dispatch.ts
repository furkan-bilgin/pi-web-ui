/**
 * Message dispatch — routes server-pushed messages to Zustand stores.
 */

import { useConnectionStore } from "../stores/connection-store";
import { useSessionStore } from "../stores/session-store";
import { useChatStore } from "../stores/chat-store";
import { handleSlashResult } from "./slash-handler";
import type { Message, SessionState, SessionInfo, SlashCommand } from "../types";

export function dispatchPacket(packet: {
  type: string;
  payload?: unknown;
  seq?: number;
  [key: string]: unknown;
}): void {
  switch (packet.type) {
    case "connected": {
      const p = packet.payload as {
        appCwd?: string;
        homeDir?: string;
        slashCommands?: SlashCommand[];
      };
      const sessionStore = useSessionStore.getState();
      if (p?.appCwd) sessionStore.setAppCwd(p.appCwd);
      if (p?.homeDir) sessionStore.setHomeDir(p.homeDir);
      if (p?.slashCommands) sessionStore.setSlashCommands(p.slashCommands);
      break;
    }

    case "session_state": {
      const state = packet.payload as SessionState;
      if (state) {
        useSessionStore.getState().setSessionState(state);
        // Update URL hash for shareable session links
        if (state.sessionFile) {
          const hash = `#${encodeURIComponent(state.sessionFile)}`;
          if (location.hash !== hash) {
            history.replaceState(null, "", hash);
          }
          // Persist to localStorage as fallback
          try {
            localStorage.setItem("pi-web-ui:session-file", state.sessionFile);
          } catch {
            // storage unavailable
          }
        }
      }
      break;
    }

    case "message_history": {
      const messages = packet.payload as Message[];
      useChatStore.getState().setSwitching(false);
      useChatStore.getState().setHistory(messages || []);
      break;
    }

    case "sessions": {
      const p = packet.payload as { currentProject?: SessionInfo[] };
      useSessionStore.getState().setSessions(p?.currentProject || []);
      break;
    }

    case "session_reset": {
      const p = packet.payload as { currentSeq?: number } | undefined;
      useChatStore.getState().resetHistory();
      // lastSeq is handled by ConnectionManager
      break;
    }

    case "session_event": {
      const event = packet.payload as { type: string; [key: string]: unknown };
      handleSessionEvent(event);
      break;
    }

    case "command_result": {
      const p = packet.payload as { command: string; ok: boolean; error?: string; data?: Record<string, unknown> };
      if (p.ok) {
        handleSlashResult(p.data || {});
      } else {
        const msg = p.error || `${p.command} failed`;
        console.warn("[dispatch] command failed:", msg);
        useChatStore.getState().setError(msg);
      }
      break;
    }

    case "server_error": {
      const msg = typeof packet.payload === "string" ? packet.payload : "Server error";
      console.error("[dispatch] server error:", msg);
      useChatStore.getState().setError(msg);
      break;
    }

    case "suggestions": {
      const suggestions = packet.payload as string[];
      if (Array.isArray(suggestions)) {
        useChatStore.getState().setSuggestions(suggestions);
      }
      break;
    }

    default:
      break;
  }
}

function handleSessionEvent(event: { type: string; [key: string]: unknown }): void {
  const chatStore = useChatStore.getState();

  switch (event.type) {
    case "agent_start":
      chatStore.onAgentStart();
      break;

    case "agent_end":
      chatStore.onAgentEnd();
      break;

    case "message_update": {
      const delta = (event as { assistantMessageEvent?: unknown }).assistantMessageEvent;
      if (delta) {
        chatStore.applyDelta(delta as Parameters<typeof chatStore.applyDelta>[0]);
      }
      break;
    }

    case "tool_execution_start":
      chatStore.onToolStart(
        (event.toolName as string) || (event.name as string) || "",
        event.args,
        event.toolCallId as string | undefined
      );
      break;

    case "tool_execution_end":
      chatStore.onToolEnd(
        (event.toolName as string) || (event.name as string) || "",
        event.result,
        event.toolCallId as string | undefined
      );
      break;

    case "compaction_start":
    case "compaction_end":
      break;

    case "auto_retry_start":
      chatStore.setError(
        `retrying (attempt ${String(event.attempt ?? "?")}): ${
          (event.error as { message?: string })?.message || "model error"
        }`
      );
      break;

    case "auto_retry_end":
      break;

    case "extension_error":
      console.error("[dispatch] extension error:", (event.error as { message?: string })?.message);
      break;

    default:
      break;
  }
}
