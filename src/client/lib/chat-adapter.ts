/**
 * Adapter between pi-web-ui's internal data types and shadcn-chatbot-kit's
 * Message / MessagePart / ToolInvocation types.
 */
import type { Message as PiMessage, Block, ExtraItem, RenderItem, ImageBlock } from "../types";
import type { Message } from "../components/ui/chat-message";

/** Convert pi-web-ui canonical items + extras into ChatMessage[]. */
export function toChatMessages(items: RenderItem[]): Message[] {
  const out: Message[] = [];
  let assistantAccum: Message | null = null;

  for (const item of items) {
    if (item.source === "typing") continue;

    if (item.source === "canonical") {
      const msg = item.message;
      if (msg.role === "user") {
        flushAssistant(out, assistantAccum);
        assistantAccum = null;
        out.push(userMessage(msg));
      } else if (msg.role === "assistant") {
        // Start or continue accumulating assistant message
        if (!assistantAccum) {
          assistantAccum = {
            id: msg._entryId || `a-${out.length}`,
            role: "assistant",
            content: "",
            parts: [],
            toolInvocations: [],
          };
        }
        addBlocksToAssistant(assistantAccum, parseBlocks(msg));
      } else if (msg.role === "toolResult" || msg.role === "tool") {
        // Merge into preceding assistant's matching tool call
        assistantAccum = ensureAssistant(out, assistantAccum);
        if (assistantAccum) {
          const toolName = (msg as Record<string, unknown>).name as string || msg.toolName || "result";
          const result = (typeof msg.content === "string"
            ? { text: msg.content }
            : msg.content) as unknown as Record<string, unknown>;
          if (result == null) {
  
            continue;
          }
          // Merge into existing "call" entry
          // Try to merge into existing "call" entry
          const invocations = assistantAccum.toolInvocations || [];
          const existingIdx = invocations.findIndex(
            (ti) => ti.toolName === toolName && ti.state === "call"
          );
          if (existingIdx >= 0) {

            invocations[existingIdx] = {
              state: "result",
              toolName,
              result,
            };
          } else {

            assistantAccum.toolInvocations = [...invocations, {
              state: "result",
              toolName,
              result,
            }];
          }
          // Also try to merge into the matching part
          const parts = assistantAccum.parts || [];
          const partIdx = parts.findIndex(
            (p) =>
              p.type === "tool-invocation" &&
              p.toolInvocation.toolName === toolName &&
              p.toolInvocation.state === "call"
          );
          if (partIdx >= 0) {

            (parts[partIdx] as {
              type: string;
              toolInvocation: { state: string; toolName: string; result?: Record<string, unknown> };
            }) = {
              type: "tool-invocation",
              toolInvocation: { state: "result", toolName, result },
            };
          } else {

            assistantAccum.parts = [...parts, {
              type: "tool-invocation",
              toolInvocation: { state: "result", toolName, result },
            }];
          }
        }
      } else if (msg.role === "bashExecution") {
        flushAssistant(out, assistantAccum);
        assistantAccum = null;
        out.push({
          id: `bash-${out.length}`,
          role: "assistant",
          content: "",
          parts: [{
            type: "tool-invocation",
            toolInvocation: {
              state: "result",
              toolName: "bash",
              result: {
                command: msg.command,
                output: msg.output,
                exitCode: msg.exitCode,
              },
            },
          }],
          toolInvocations: [{
            state: "result",
            toolName: "bash",
            result: { command: msg.command, output: msg.output, exitCode: msg.exitCode },
          }],
        });
      } else {
        flushAssistant(out, assistantAccum);
        assistantAccum = null;
        out.push({
          id: `msg-${out.length}`,
          role: "assistant",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      }
    } else if (item.source === "extra") {
      const ei = item.item;
      if (ei.kind === "user") {
        flushAssistant(out, assistantAccum);
        assistantAccum = null;
        const text = ei.blocks.find((b) => b.type === "text")?.text || "";
        const imageBlocks = ei.blocks.filter(
          (b): b is ImageBlock => b.type === "image"
        );
        const msg: Message = {
          id: `extra-user-${out.length}`,
          role: "user",
          content: text,
        };
        if (imageBlocks.length > 0) {
          msg.experimental_attachments = imageBlocks.map((b) => ({
            name: "pasted-image",
            contentType: b.mimeType,
            url: b.data.startsWith("data:") ? b.data : `data:${b.mimeType};base64,${b.data}`,
          }));
        }
        out.push(msg);
      } else if (ei.kind === "assistant") {
        if (!assistantAccum) {
          assistantAccum = {
            id: `extra-${out.length}`,
            role: "assistant",
            content: "",
            parts: [],
            toolInvocations: [],
          };
        }
        addBlocksToAssistant(assistantAccum, ei.blocks);
      } else if (ei.kind === "tool") {
        assistantAccum = ensureAssistant(out, assistantAccum);
        if (assistantAccum) {
          for (const block of ei.blocks) {
            if (block.type === "tool_result" || block.type === "tool_combined") {
              const toolName = block.name || "tool";
              const result = block.result as Record<string, unknown>;
              // Skip placeholder results (null/undefined) — they are added
              // by onToolStart before the actual result arrives.
              if (result == null) continue;
              // Merge into existing "call" tool invocation instead of
              // adding a duplicate "result" entry.
              const invocations = assistantAccum.toolInvocations || [];
              const existingIdx = invocations.findIndex(
                (ti) => ti.toolName === toolName && ti.state === "call"
              );
              if (existingIdx >= 0) {
                invocations[existingIdx] = {
                  state: "result",
                  toolName,
                  result,
                };
              } else {
                assistantAccum.toolInvocations = [...invocations, {
                  state: "result",
                  toolName,
                  result,
                }];
              }
              // Also update the matching part
              const parts = assistantAccum.parts || [];
              const partIdx = parts.findIndex(
                (p) =>
                  p.type === "tool-invocation" &&
                  p.toolInvocation.toolName === toolName &&
                  p.toolInvocation.state === "call"
              );
              if (partIdx >= 0) {
                (parts[partIdx] as {
                  type: string;
                  toolInvocation: { state: string; toolName: string; result?: Record<string, unknown> };
                }) = {
                  type: "tool-invocation",
                  toolInvocation: { state: "result", toolName, result },
                };
              } else {
                assistantAccum.parts = [...parts, {
                  type: "tool-invocation",
                  toolInvocation: { state: "result", toolName, result },
                }];
              }
            }
          }
        }
      }
    }
  }

  flushAssistant(out, assistantAccum);
  return out;
}

function userMessage(msg: PiMessage): Message {
  const content = msg.content;
  if (typeof content === "string") {
    return {
      id: msg._entryId || `u-${Date.now()}`,
      role: "user",
      content,
    };
  }
  if (!Array.isArray(content)) {
    return {
      id: msg._entryId || `u-${Date.now()}`,
      role: "user",
      content: "",
    };
  }
  const texts: string[] = [];
  const attachments: Attachment[] = [];
  for (const c of content) {
    const item = c as Record<string, unknown>;
    if (!item || typeof item !== "object") continue;
    if (item.type === "text" && typeof item.text === "string") {
      texts.push(item.text);
    } else if (item.type === "image" && typeof item.data === "string") {
      const mime = (item.mimeType as string) || "image/png";
      const url = (item.data as string).startsWith("data:")
        ? (item.data as string)
        : `data:${mime};base64,${item.data}`;
      attachments.push({ name: "image", contentType: mime, url });
    }
  }
  return {
    id: msg._entryId || `u-${Date.now()}`,
    role: "user",
    content: texts.join("\n"),
    experimental_attachments: attachments.length > 0 ? attachments : undefined,
  };
}

function parseBlocks(msg: PiMessage): Block[] {
  if (typeof msg.content === "string") {
    return [{ type: "text", text: msg.content }];
  }
  if (!Array.isArray(msg.content)) return [];
  return msg.content.map((c): Block | null => {
    const item = c as Record<string, unknown>;
    if (!item || typeof item !== "object") return null;
    switch (item.type as string) {
      case "text":
        return { type: "text", text: (item.text as string) || "" };
      case "thinking":
        return { type: "thinking", text: (item.thinking as string) || "" };
      case "toolCall":
        return { type: "tool_call", id: item.id as string, name: (item.name as string) || "", input: item.arguments };
      case "toolResult":
        return { type: "tool_result", name: (item.toolName as string) || "result", result: item };
      case "image":
        if (typeof item.data === "string") {
          return { type: "image", mimeType: (item.mimeType as string) || "image/png", data: item.data };
        }
        return null;
      default:
        return null;
    }
  }).filter((b): b is Block => b !== null);
}

function addBlocksToAssistant(acc: Message, blocks: Block[]): void {
  acc.parts = acc.parts || [];
  acc.toolInvocations = acc.toolInvocations || [];

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        if (block.text) {
          acc.parts.push({ type: "text", text: block.text });
        }
        break;
      case "thinking":
        if (block.text) {
          acc.parts.push({ type: "reasoning", reasoning: block.text });
        }
        break;
      case "tool_call":
        acc.toolInvocations.push({
          state: "call",
          toolName: block.name,
        });
        acc.parts.push({
          type: "tool-invocation",
          toolInvocation: {
            state: "call",
            toolName: block.name,
          },
        });
        break;
      case "tool_combined":
        acc.toolInvocations.push({
          state: "result",
          toolName: block.name,
          result: block.result as Record<string, unknown>,
        });
        acc.parts.push({
          type: "tool-invocation",
          toolInvocation: {
            state: "result",
            toolName: block.name,
            result: block.result as Record<string, unknown>,
          },
        });
        break;
      case "tool_result":
        // tool result that arrived as a separate extra
        acc.toolInvocations.push({
          state: "result",
          toolName: block.name || "tool",
          result: block.result as Record<string, unknown>,
        });
        acc.parts.push({
          type: "tool-invocation",
          toolInvocation: {
            state: "result",
            toolName: block.name || "tool",
            result: block.result as Record<string, unknown>,
          },
        });
        break;
      case "image":
        acc.parts.push({
          type: "file",
          mimeType: block.mimeType,
          data: block.data,
        });
        break;
    }
  }
}

function flushAssistant(out: Message[], acc: Message | null): void {
  if (!acc) return;
  // Compute content from text parts
  const textParts = (acc.parts || []).filter((p) => p.type === "text") as { type: "text"; text: string }[];
  acc.content = textParts.map((p) => p.text).join("\n");
  out.push(acc);
}

function ensureAssistant(out: Message[], acc: Message | null): Message {
  if (!acc) {
    acc = {
      id: `auto-${out.length}`,
      role: "assistant",
      content: "",
      parts: [],
      toolInvocations: [],
    };
    out.push(acc);
  }
  return acc;
}
