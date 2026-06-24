/**
 * Handles slash command results from the server.
 * Phase 1: server returns { needsPicker, ... } data
 * Phase 2: client shows a picker modal, user selects → sends another slash_command
 */
import type { SessionInfo } from "../types";
import { useChatStore } from "../stores/chat-store";
import { showInfo } from "../lib/toast";

// Module-level send reference — set by App.tsx when connection is ready.
let globalSend: ((msg: Record<string, unknown>) => void) | null = null;

export function setGlobalSend(fn: (msg: Record<string, unknown>) => void): void {
  globalSend = fn;
}

function send(msg: Record<string, unknown>): void {
  globalSend?.(msg);
}

interface SlashResult {
  needsPicker?: string;
  showText?: { title: string; body: string };
  copyText?: string;
  cwd?: string;
  editorText?: string;
  exportedTo?: string;
  showHotkeys?: boolean;
  sessions?: { currentProject: SessionInfo[] };
  models?: Array<{ provider: string; id: string; name: string; contextWindow: number }>;
  tree?: Array<{ id: string; summary: string; role: string; kind: string }>;
  currentModel?: string | null;
  currentSessionFile?: string | null;
  leafId?: string;
  [key: string]: unknown;
}

type PickerCallback = (value: string) => void;

let pendingPicker: PickerCallback | null = null;

export function getPendingPicker(): PickerCallback | null {
  return pendingPicker;
}

export function clearPendingPicker(): void {
  pendingPicker = null;
}

/**
 * Handle a successful slash command result from the server.
 * This may show a picker modal (needsPicker), a text modal, or take direct action.
 */
export async function handleSlashResult(data: SlashResult): Promise<void> {
  if (!data) return;

  // Direct actions
  if (data.copyText) {
    try {
      await navigator.clipboard.writeText(data.copyText);
      showInfo("Copied to clipboard");
    } catch {
      // clipboard unavailable
    }
    return;
  }

  if (data.exportedTo) {
    showInfo(`Exported: ${data.exportedTo}`);
    return;
  }

  if (data.showHotkeys) {
    // TODO: show hotkeys modal
    return;
  }

  if (data.showText) {
    // TODO: show text modal
    return;
  }

  if (typeof data.cwd === "string") {
    showInfo(`CWD: ${data.cwd}`);
    return;
  }

  if (typeof data.editorText === "string" && data.editorText) {
    // Prefill composer - dispatch a custom event that the Composer can listen for
    window.dispatchEvent(new CustomEvent("pi:prefill", { detail: data.editorText }));
    return;
  }

  // Picker modals
  if (data.needsPicker === "session" && data.sessions) {
    showPickerModal(
      "Switch Session",
      (data.sessions.currentProject || []).map((s: SessionInfo) => ({
        id: s.id,
        label: s.name || s.id.slice(-12),
        description: s.messageCount ? `${s.messageCount} msgs` : "",
      })),
      (sessionId: string) => {
        send({ type: "slash_command", name: "resume", arg: sessionId });
        // Optimistic UI: clear chat and show loading
        useChatStore.getState().resetHistory([]);
      }
    );
    return;
  }

  if (data.needsPicker === "model" && data.models) {
    showPickerModal(
      "Select Model",
      data.models.map((m) => ({
        id: `${m.provider}/${m.id}`,
        label: `${m.provider}/${m.id}`,
        description: `${m.name} (${m.contextWindow.toLocaleString()} ctx)`,
      })),
      (id: string) => {
        send({ type: "slash_command", name: "model", arg: id });
      }
    );
    return;
  }

  if (data.needsPicker === "tree" && data.tree) {
    showPickerModal(
      "Session Tree",
      data.tree.map((n) => ({
        id: n.id,
        label: n.summary || n.id,
        description: `${n.role} • ${n.kind}`,
      })),
      (id: string) => {
        send({ type: "slash_command", name: "tree", arg: id });
      }
    );
    return;
  }
}

// ---- Modal-based picker ----

function showPickerModal(
  title: string,
  items: { id: string; label: string; description?: string }[],
  onSelect: (id: string) => void
): void {
  pendingPicker = onSelect;
  // Dispatch an event that App.tsx listens for to show the Modal
  window.dispatchEvent(
    new CustomEvent("pi:show-picker", {
      detail: { title, items },
    })
  );
}

/**
 * Called when the user selects an item from the picker modal.
 */
export function resolvePicker(value: string): void {
  if (pendingPicker) {
    const cb = pendingPicker;
    pendingPicker = null;
    cb(value);
  }
}

/**
 * Called when the picker modal is dismissed without a selection.
 * Prevents stale callbacks from leaking.
 */
export function rejectPicker(): void {
  if (pendingPicker) {
    const cb = pendingPicker;
    pendingPicker = null;
    cb(""); // empty string signals cancellation
  }
}
