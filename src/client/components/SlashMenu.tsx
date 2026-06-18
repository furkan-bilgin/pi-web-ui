import { useState, useEffect, useCallback, useRef } from "react";
import { useSessionStore } from "../stores/session-store";
import type { SlashCommand } from "../types";

interface SlashMenuProps {
  input: string;
  onSelect: (command: string, arg: string) => void;
  onClose: () => void;
}

export function SlashMenu({ input, onSelect, onClose }: SlashMenuProps) {
  const slashCommands = useSessionStore((s) => s.slashCommands);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Parse the slash query from input
  const match = input.match(/^\/(\w*)$/);
  const query = match?.[1]?.toLowerCase() || "";

  const filtered = slashCommands.filter(
    (cmd) => !query || cmd.name.startsWith(query)
  );

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIdx((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (filtered[selectedIdx]) {
            const cmd = filtered[selectedIdx];
            onSelect(cmd.name, cmd.argumentHint || "");
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, selectedIdx, onSelect, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!query && slashCommands.length === 0) return null;
  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
      <div className="mx-auto max-w-3xl">
        <div
          ref={listRef}
          className="max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
        >
          {filtered.map((cmd, i) => (
            <button
              key={cmd.name}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                i === selectedIdx
                  ? "bg-accent text-accent-foreground"
                  : "text-popover-foreground hover:bg-muted"
              } ${!cmd.supported ? "opacity-50" : ""}`}
              onClick={() => onSelect(cmd.name, cmd.argumentHint || "")}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <code className="min-w-[70px] rounded border bg-muted px-1.5 py-0.5 text-center text-xs text-muted-foreground">
                /{cmd.name}
              </code>
              <span className="flex-1 truncate">{cmd.description}</span>
              {cmd.argumentHint && (
                <span className="text-xs text-muted-foreground/60">
                  {cmd.argumentHint}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
