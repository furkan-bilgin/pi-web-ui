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
export function mergeCanonicalItems(
  items: RenderItem[],
): { mergedBlocks: Map<number, Block[]>; skipIndices: Set<number> } {
  const mergedBlocks = new Map<number, Block[]>();
  const skipIndices = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.source !== "canonical") continue;
    if (item.message.role !== "assistant") continue;

    const blocks = parseMessageBlocks(item.message);
    const toolCalls = blocks.filter((b) => b.type === "tool_call");
    if (toolCalls.length === 0) continue;

    // Look ahead for tool result messages
    const toolResults: { block: Block; idx: number }[] = [];
    let j = i + 1;
    while (j < items.length && items[j].source === "canonical") {
      const next = items[j];
      if (next.message.role !== "toolResult" && next.message.role !== "tool") break;
      const nextBlocks = parseMessageBlocks(next.message);
      const tr = nextBlocks.find((b) => b.type === "tool_result");
      if (!tr) break;
      toolResults.push({ block: tr, idx: j });
      j++;
    }

    if (toolResults.length === 0) continue;

    // Merge: replace tool_call + tool_result pairs with tool_combined
    const count = Math.min(toolCalls.length, toolResults.length);
    const merged = blocks.slice(); // copy
    for (let k = 0; k < count; k++) {
      const tcIdx = merged.indexOf(toolCalls[k]);
      if (tcIdx >= 0) {
        merged[tcIdx] = {
          type: "tool_combined" as const,
          name: toolCalls[k].name,
          input: (toolCalls[k] as Block & { type: "tool_call" }).input,
          result: (toolResults[k].block as Block & { type: "tool_result" }).result,
        };
        // Remove the old tool_call that was at the next position (it's been merged)
        // Actually, tool_calls were at their original positions. The tool_combined
        // replaces the tool_call, and the tool_result blocks in the next message
        // are skipped entirely.
      }
    }

    mergedBlocks.set(i, merged);
    for (const tr of toolResults) {
      skipIndices.add(tr.idx);
    }
  }

  return { mergedBlocks, skipIndices };
}

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
