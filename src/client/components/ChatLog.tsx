import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { useChatStore } from "../stores/chat-store";
import { useUiStore } from "../stores/ui-store";
import { MessageList } from "../components/ui/message-list";
import type { Message as ChatMessage } from "../components/ui/chat-message";
import { toChatMessages } from "../lib/chat-adapter";
import { SuggestionChips } from "./SuggestionChips";
import { useConnection } from "../lib/connection-provider";
import { routeInput } from "../lib/route-input";
import type { RenderItem } from "../types";
import { Loader2 } from "lucide-react";

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-2 text-5xl text-muted-foreground/60 font-mono font-bold">
        {">_"}
      </div>
      <h2 className="mb-1 text-xl font-semibold text-foreground">Pi Web UI</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Start a conversation or resume a previous session.
      </p>
      <div className="flex flex-col gap-1.5 text-sm">
        {[
          { cmd: "/new", desc: "New session" },
          { cmd: "/resume", desc: "Switch session" },
          { cmd: "/rename", desc: "Name this session" },
          { cmd: "/tree", desc: "Session history" },
        ].map(({ cmd, desc }) => (
          <div key={cmd} className="flex items-center gap-2">
            <code className="min-w-[70px] rounded border bg-muted px-1.5 py-0.5 text-center text-xs text-muted-foreground">
              {cmd}
            </code>
            <span className="text-muted-foreground">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatLog() {
  const overlayImage = useUiStore((s) => s.overlayImage);
  const setOverlayImage = useUiStore((s) => s.setOverlayImage);

  const canonical = useChatStore((s) => s.canonical);
  const pendingUser = useChatStore((s) => s.pendingUser);
  const streamExtras = useChatStore((s) => s.streamExtras);
  const showTyping = useChatStore((s) => s.showTyping);
  const isRunning = useChatStore((s) => s.isRunning);
  const switching = useChatStore((s) => s.switching);

  const { send } = useConnection();

  // Build render items from raw Zustand fields
  const items = useMemo(() => {
    const lastUser = (() => {
      for (let i = canonical.length - 1; i >= 0; i--) {
        if (canonical[i]?.role === "user") return i;
      }
      return -1;
    })();
    const canonicalEnd =
      streamExtras.length > 0 && lastUser >= 0 && !pendingUser
        ? lastUser + 1
        : canonical.length;

    const result: RenderItem[] = [];
    for (let i = 0; i < canonicalEnd; i++) {
      result.push({ source: "canonical", message: canonical[i] });
    }
    if (pendingUser) result.push({ source: "extra", item: pendingUser });
    for (const e of streamExtras) result.push({ source: "extra", item: e });
    return result;
  }, [canonical, pendingUser, streamExtras]);

  // Convert to ChatMessage[] format
  const chatMessages = useMemo(() => toChatMessages(items), [items]);

  // Scroll-follow
  const scrollRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      followRef.current = dist < 40;
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    if (followRef.current) {
      logEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [chatMessages]);

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 md:px-8"
      >
        {switching ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="mb-2 h-6 w-6 animate-spin" />
            <p className="text-sm">Loading session...</p>
          </div>
        ) : chatMessages.length === 0 && !showTyping ? (
          <EmptyState />
        ) : (
          <div className="mx-auto max-w-3xl">
            <MessageList
              messages={chatMessages}
              showTimeStamps={false}
              isTyping={showTyping}
              messageOptions={(msg) => ({
                onRevert: msg.role === 'user'
                  ? (entryId) => {
                    console.log('[ChatLog] revert id=', entryId, 'content=', msg.content?.slice(0,50));
                    useChatStore.getState().setPendingInput(msg.content);
                    // Convert experimental_attachments back to image data
                    const imgs = (msg.experimental_attachments || [])
                      .filter((a) => a.contentType?.startsWith('image/'))
                      .map((a) => {
                        // data:image/png;base64,... -> { data: rawBase64, mimeType }
                        const parts = a.url.split(',');
                        return { data: parts[1] || parts[0], mimeType: a.contentType || 'image/png' };
                      });
                    useChatStore.getState().setPendingImages(imgs.length > 0 ? imgs : null);
                    send({ type: 'slash_command', name: 'tree', arg: entryId });
                  }
                  : undefined,
              })}
            />
            <SuggestionChips />
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Image overlay */}
      {overlayImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOverlayImage(null)}
        >
          <img
            src={overlayImage}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            alt=""
          />
        </div>
      )}
    </>
  );
}
