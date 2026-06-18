import { useSessionStore } from "../stores/session-store";
import { useChatStore } from "../stores/chat-store";
import { useConnectionStore } from "../stores/connection-store";

function displayPath(path: string, homeDir: string): string {
  if (!path || !homeDir) return path || "";
  if (path === homeDir) return "~/";
  if (path.startsWith(homeDir + "/")) return "~/" + path.slice(homeDir.length + 1);
  return path;
}

export function StatusBar() {
  const sessionState = useSessionStore((s) => s.sessionState);
  const homeDir = useSessionStore((s) => s.homeDir);
  const lastError = useChatStore((s) => s.lastError);
  const connectionStatus = useConnectionStore((s) => s.status);

  if (!sessionState) {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          {connectionStatus === "connecting"
            ? "Connecting..."
            : connectionStatus === "reconnecting"
              ? "Reconnecting..."
              : connectionStatus === "disconnected"
                ? "Disconnected"
                : "Ready"}
        </span>
      </div>
    );
  }

  const ctx = sessionState.contextUsage;
  const pct = ctx?.percent ?? 0;
  const win = ctx?.contextWindow || sessionState.model?.contextWindow || 0;
  const winK = win ? `${Math.round(win / 1000)}k` : "?";
  const mode = sessionState.autoCompactionEnabled ? "auto" : "off";
  const pctClass =
    pct >= 90 ? "text-red-400" : pct >= 70 ? "text-muted-foreground" : "";
  const name = sessionState.sessionName
    ? `(${sessionState.sessionName})`
    : "";
  const model = sessionState.model
    ? `${sessionState.model.provider}/${sessionState.model.id}`
    : "(no model)";
  const think = sessionState.thinkingLevel || "off";

  return (
    <div className="flex flex-col gap-0.5 border-t border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
      <div className="flex items-center justify-between gap-4">
        <span
          className="truncate text-muted-foreground cursor-default"
          title="Current working directory"
        >
          {displayPath(sessionState.cwd, homeDir)}
        </span>
        {lastError && (
          <span className="truncate text-red-400" title={lastError}>
            {lastError}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>
          <span className={pctClass}>{pct.toFixed(1)}%</span>
          <span className="text-muted-foreground">
            /{winK}{" "}
            <span className="text-muted-foreground/50">{mode}</span>
          </span>
        </span>
        <span className="truncate">
          <span className="text-sky-400">{name}</span>{" "}
          <span className="text-muted-foreground">{model}</span>{" "}
          <span className="text-muted-foreground/40">&bull;</span>{" "}
          <span className="text-muted-foreground/60">{think}</span>
        </span>
      </div>
    </div>
  );
}
