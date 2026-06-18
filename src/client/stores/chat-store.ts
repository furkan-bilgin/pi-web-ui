import { create } from "zustand";
import type {
  Message,
  ExtraItem,
  Block,
  MessageDelta,
  RenderItem,
} from "../types";

interface ChatStore {
  canonical: Message[];
  pendingUser: ExtraItem | null;
  streamExtras: ExtraItem[];
  showTyping: boolean;
  isRunning: boolean;
  liveAssistant: ExtraItem | null;
  liveTextBlocks: Map<number, Block> | null;
  suggestions: string[];
  setSuggestions: (s: string[]) => void;
  lastError: string | null;
  switching: boolean;
  setSwitching: (v: boolean) => void;
  pendingInput: string | null;
  setPendingInput: (v: string | null) => void;
  pendingImages: { data: string; mimeType: string }[] | null;
  setPendingImages: (v: { data: string; mimeType: string }[] | null) => void;

  submitUser: (text: string, images?: { data: string; mimeType: string }[]) => void;
  setHistory: (messages: Message[]) => void;
  resetHistory: (messages?: Message[]) => void;
  applyDelta: (delta: MessageDelta) => void;
  onToolStart: (name: string, input: unknown, id?: string) => void;
  onToolEnd: (name: string, result: unknown, id?: string) => void;
  onAgentStart: () => void;
  onAgentEnd: () => void;
  setError: (error: string | null) => void;
  selectItems: () => RenderItem[];
}

function lastUserMessageIndex(canonical: Message[]): number {
  for (let i = canonical.length - 1; i >= 0; i--) {
    if (canonical[i]?.role === "user") return i;
  }
  return -1;
}

function contentToText(content: string | { type: string; text?: string }[]): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const t = content.find((c) => c && c.type === "text");
    return t?.text ?? null;
  }
  return null;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  canonical: [],
  pendingUser: null,
  streamExtras: [],
  showTyping: false,
  isRunning: false,
  liveAssistant: null,
  liveTextBlocks: null,
  suggestions: [],
  setSuggestions: (suggestions) => set({ suggestions }),
  switching: false,
  setSwitching: (v) => set({ switching: v }),
  pendingInput: null,
  setPendingInput: (v) => set({ pendingInput: v }),
  pendingImages: null,
  setPendingImages: (v) => set({ pendingImages: v }),

  submitUser: (text, images) => {
    console.log("[chat-store] submitUser");
    const blocks: Block[] = [];
    if (text) blocks.push({ type: "text", text });
    if (images) {
      for (const img of images) {
        blocks.push({ type: "image", mimeType: img.mimeType, data: img.data });
      }
    }
    set({
      pendingUser: { kind: "user", title: "You", blocks },
      showTyping: true,
      isRunning: true,
      liveAssistant: null,
      liveTextBlocks: null,
      streamExtras: [],
      lastError: null,
      suggestions: [],
    });
  },

  setHistory: (messages) => {
    console.log("[chat-store] setHistory", messages?.length, "messages, showTyping was", get().showTyping);
    const state = get();
    const pendingUser = state.pendingUser;
    if (pendingUser) {
      const pendingText = contentToText(
        pendingUser.blocks.find((b) => b.type === "text")?.text ?? ""
      ) ?? "";
      const lastUser = (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i]?.role === "user") return messages[i];
        }
        return null;
      })();
      if (lastUser && (contentToText(lastUser.content) ?? "") === pendingText) {
        set({ pendingUser: null });
      }
    }
    // Deduplicate messages by _entryId — the SDK can return duplicates when
    // the session is mid-turn and history is requested.
    const deduped = [];
    const seen = new Set();
    if (Array.isArray(messages)) {
      for (const m of messages) {
        const key = m._entryId || (typeof m.content === "string" ? m.content.slice(0, 100) : JSON.stringify(m.content));
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(m);
      }
    }

    // Clear streamExtras so stale streaming deltas don't survive a canonical
    // snapshot. This prevents word-by-word duplication on reconnect.
    set({
      canonical: deduped,
      streamExtras: [],
      liveAssistant: null,
      liveTextBlocks: null,
      showTyping: false,
    });
  },

  resetHistory: (messages) => {
    console.log("[chat-store] resetHistory");
    set({
      canonical: messages ? messages.slice() : [],
      streamExtras: [],
      pendingUser: null,
      liveAssistant: null,
      liveTextBlocks: null,
      showTyping: false,
    });
  },

  applyDelta: (delta) => {
    const state = get();
    if (delta.type === "text_delta" || delta.type === "thinking_delta") {
      const kind = delta.type === "thinking_delta" ? "thinking" : "text";
      const idx = delta.contentIndex;
      let live = state.liveAssistant;
      let blocks = state.liveTextBlocks;
      if (!live) {
        blocks = new Map();
        live = { kind: "assistant", title: "Assistant", blocks: [] };
      }
      let block = idx !== undefined ? blocks?.get(idx) : null;
      if (!block || block.type !== kind) {
        block = { type: kind, text: "" } as Block;
        live.blocks.push(block);
        if (idx !== undefined && blocks) blocks.set(idx, block);
      }
      if (block.type === "text" || block.type === "thinking") {
        // TypeScript narrowing
        if (delta.delta) {
          (block as { type: string; text: string }).text += delta.delta;
        }
      }
      const deltaType = delta.type;
      console.log("[chat-store] applyDelta", deltaType, "showTyping was", state.showTyping);
      const update: Partial<ChatStore> = {
        liveAssistant: live,
        liveTextBlocks: new Map(blocks || new Map()),
        streamExtras: state.streamExtras.some((e) => e === live)
          ? [...state.streamExtras]
          : [...state.streamExtras, live!],
      };
      // Keep typing indicator during thinking; clear it once real text arrives
      if (delta.type === "text_delta") {
        update.showTyping = false;
        console.log("[chat-store] text_delta -> clearing showTyping");
      }
      set(update);
      return;
    }
    if (delta.type === "toolcall_end" && delta.toolCall) {
      const tc = delta.toolCall;
      let live = state.liveAssistant;
      if (!live) {
        live = { kind: "assistant", title: "Assistant", blocks: [] };
      }
      live.blocks.push({
        type: "tool_call",
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
      });
      set({
        showTyping: false,
        liveAssistant: live,
        liveTextBlocks: new Map(),
        streamExtras: state.streamExtras.some((e) => e === live)
          ? state.streamExtras
          : [...state.streamExtras, live!],
      });
    }
  },

  onToolStart: (name, input, id) => {
    console.log("[chat-store] onToolStart", name);
    const state = get();
    let live = state.liveAssistant;
    if (!live) {
      live = { kind: "assistant", title: "Assistant", blocks: [] };
    }
    // Add tool_call block if not already present
    const hasCall = live.blocks.some(
      (b) => b.type === "tool_call" && b.id === id
    );
    if (!hasCall) {
      live.blocks.push({ type: "tool_call", id, name, input });
    }
    const placeholder: ExtraItem = {
      kind: "tool",
      title: `Tool result: ${name}`,
      blocks: [{ type: "tool_result", id, name, result: null }],
    };
    set({
      showTyping: false,
      liveAssistant: live,
      liveTextBlocks: new Map(),
      streamExtras: (() => {
        // Insert placeholder right after the assistant extra so tool
        // results are always processed AFTER the assistant's tool_call.
        const existing = state.streamExtras;
        const idx = existing.indexOf(live);
        if (idx >= 0) {
          const copy = [...existing];
          copy.splice(idx + 1, 0, placeholder);
          return copy;
        }
        return [...existing, live, placeholder];
      })(),
    });
  },

  onToolEnd: (name, result, id) => {
    const state = get();
    const extras = state.streamExtras;
    // Find matching placeholder by id or name
    let found = false;
    const newExtras = extras.map((item) => {
      if (item.kind !== "tool") return item;
      const block = item.blocks[0];
      if (!block || block.type !== "tool_result") return item;
      if (id && block.id === id) {
        found = true;
        return {
          ...item,
          blocks: [{ type: "tool_result" as const, name, result }],
        };
      }
      if (!id && block.name === name && block.result === null) {
        found = true;
        return {
          ...item,
          blocks: [{ type: "tool_result" as const, name, result }],
        };
      }
      return item;
    });
    if (!found) {
      newExtras.push({
        kind: "tool",
        title: `Tool result: ${name}`,
        blocks: [{ type: "tool_result", name, result }],
      });
    }
    set({
      streamExtras: newExtras,
      liveAssistant: null,
      liveTextBlocks: null,
      showTyping: state.isRunning,
    });
  },

  onAgentStart: () => {
    set({ isRunning: true, lastError: null });
  },

  onAgentEnd: () => {
    set({
      isRunning: false,
      showTyping: false,
      liveAssistant: null,
      liveTextBlocks: null,
    });
  },

  setError: (error) => set({ lastError: error }),

  selectItems: () => {
    const state = get();
    const items: RenderItem[] = [];
    const lastUser = lastUserMessageIndex(state.canonical);
    const canonicalEnd =
      state.streamExtras.length > 0 && lastUser >= 0 && !state.pendingUser
        ? lastUser + 1
        : state.canonical.length;
    for (let i = 0; i < canonicalEnd; i++) {
      items.push({ source: "canonical", message: state.canonical[i] });
    }
    if (state.pendingUser) {
      items.push({ source: "extra", item: state.pendingUser });
    }
    for (const e of state.streamExtras) {
      items.push({ source: "extra", item: e });
    }
    if (state.showTyping) {
      items.push({ source: "typing" });
    }
    return items;
  },
}));
