/**
 * Pure input routing — decides how a composer message should be sent.
 * Ported from the old pi-web-ui route-input.mjs.
 */

export type RouteResult =
  | { kind: "empty" }
  | { kind: "bash"; command: string }
  | { kind: "slash"; name: string; arg: string }
  | { kind: "prompt"; message: string };

export function routeInput(message: string, bashMode = false): RouteResult {
  const text = (message ?? "").trim();
  if (!text) return { kind: "empty" };

  // Bash mode: !command or bashMode toggle
  const bashCommand = bashMode
    ? text
    : text.startsWith("!") && !text.startsWith("!/")
      ? text.slice(1).trim()
      : null;
  if (bashCommand !== null) {
    if (!bashCommand) return { kind: "empty" };
    return { kind: "bash", command: bashCommand };
  }

  // Slash commands: /command [arg]
  const slashMatch = text.match(/^\/([^\s]*)(?:\s+(.*))?$/);
  if (slashMatch) {
    return { kind: "slash", name: slashMatch[1] || "", arg: slashMatch[2] ?? "" };
  }

  // Regular prompt
  return { kind: "prompt", message: text };
}
