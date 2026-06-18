import { useState, useMemo } from "react";
import { cn } from "../lib/utils";
import { useSessionStore } from "../stores/session-store";
import type { SessionInfo } from "../types";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewSession: () => void;
  onSwitchSession: (path: string) => void;
  onDeleteSession: (path: string, name: string) => void;
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return iso;
  }
}

function SessionRow({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: SessionInfo;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const title =
    session.name || session.firstMessage || `${session.id.slice(0, 8)}\u2026`;
  const time = formatRelativeTime(session.modified);
  const msgs = session.messageCount ?? 0;

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer flex-col gap-0.5 border-l-3 px-3 py-2 transition-colors hover:bg-sidebar-accent",
        isActive
          ? "border-l-primary bg-sidebar-accent"
          : "border-l-transparent"
      )}
      onClick={onSelect}
    >
      <div className="truncate text-sm font-medium text-sidebar-foreground">
        {title}
      </div>
      <div className="truncate text-xs text-sidebar-foreground/50">
        {time} &middot; {msgs} msg{msgs === 1 ? "" : "s"}
      </div>
      <button
        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-xs text-sidebar-foreground/40 opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-red-400 group-hover:opacity-60"
        title="Delete session"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        &times;
      </button>
    </div>
  );
}

export function Sidebar({
  isOpen,
  onClose,
  onNewSession,
  onSwitchSession,
  onDeleteSession,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const sessions = useSessionStore((s) => s.sessions);
  const sessionFile = useSessionStore((s) => s.sessionState?.sessionFile ?? null);

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      const title = (s.name || s.firstMessage || "").toLowerCase();
      const cwd = (s.cwd || "").toLowerCase();
      return title.includes(q) || cwd.includes(q);
    });
  }, [sessions, search]);

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full w-72 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform md:static md:z-auto md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2.5">
          <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            Sessions
          </span>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md border border-sidebar-border text-sm text-sidebar-foreground/50 transition-colors hover:border-foreground/30 hover:text-foreground"
            title="New session"
            onClick={onNewSession}
          >
            +
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground md:hidden"
            title="Toggle sidebar"
            onClick={onClose}
          >
            &#9776;
          </button>
        </div>

        {/* Search */}
        <input
          className="w-full border-b border-sidebar-border bg-transparent px-3 py-1.5 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40 focus:border-foreground/40"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-sidebar-foreground/40">
              {search ? "No matches" : "No sessions yet"}
            </div>
          )}
          {filtered.map((s) => (
            <SessionRow
              key={s.path}
              session={s}
              isActive={s.path === sessionFile}
              onSelect={() => onSwitchSession(s.path)}
              onDelete={() =>
                onDeleteSession(
                  s.path,
                  s.name || s.firstMessage || s.id
                )
              }
            />
          ))}
        </div>
      </aside>
    </>
  );
}
