/**
 * Merge consecutive tool_call + tool_result pairs into tool_combined blocks.
 * This keeps the UI clean — each tool renders as one collapsible element.
 */
import type { Block, ExtraItem, Message, RenderItem } from "../types";

/** Merge consecutive tool_call + tool_result blocks within a single array. */
export function mergeToolBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b?.type === "tool_call" && i + 1 < blocks.length && blocks[i + 1]?.type === "tool_result") {
      const next = blocks[i + 1];
      out.push({
        type: "tool_combined",
        name: b.name,
        input: b.input,
        result: next.result,
      });
      i += 2;
    } else {
      out.push(b);
      i++;
    }
  }
  return out;
}

/**
/** Find the index of a matching tool_call in blocks. Prefer ID, fall back to name. */
export function findMatchingToolCall(
  blocks: Block[],
  name: string,
  id?: string
): number {
  if (id) {
    const idx = blocks.findIndex(
      (b) => b.type === "tool_call" && (b as Block & { type: "tool_call" }).id === id
    );
    if (idx >= 0) return idx;
  }
  // Fall back: last unmatched tool_call with same name
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type === "tool_call" && (b as Block & { type: "tool_call" }).name === name) return i;
  }
  return -1;
}

/**
 * Merge tool_result blocks from a tool-only message into the preceding
 * assistant message's tool_call blocks. Returns the merged blocks for the
 * assistant message and a set of canonical indices to skip.
 */
/** Single source of truth for parsing a Message into Block[]. */
export function parseMessageBlocks(msg: Message): Block[] {
  // Tool result messages use role="toolResult" with content as the result
  if (msg.role === "toolResult" || msg.role === "tool") {
    return [{
      type: "tool_result",
      name: msg.toolName || "result",
      result: msg.content,
    }];
  }
  // Bash execution
  if (msg.role === "bashExecution") {
    const text = `${msg.output || ""}${msg.exitCode !== undefined ? `\n\nexitCode: ${msg.exitCode}` : ""}`.trim();
    return [{ type: "text", text }];
  }
  // Branch / compaction summary
  if (msg.role === "branchSummary" || msg.role === "compactionSummary") {
    return [{ type: "text", text: msg.summary || "" }];
  }
  // Default: user, assistant — parse content array
  if (typeof msg.content === "string") {
    return [{ type: "text", text: msg.content }];
  }
  if (!Array.isArray(msg.content)) return [];
  return msg.content.map((c): Block | null => {
    if (!c || typeof c !== "object") return null;
    switch (c.type) {
      case "text":
        return { type: "text", text: c.text || "" };
      case "thinking":
        return { type: "thinking", text: c.thinking || "" };
      case "toolCall":
        return { type: "tool_call", id: c.id, name: c.name || "", input: c.arguments };
      case "toolResult":
        return { type: "tool_result", name: (c as { toolName?: string }).toolName || "result", result: c };
      default:
        return null;
    }
  }).filter((b): b is Block => b !== null);
}
