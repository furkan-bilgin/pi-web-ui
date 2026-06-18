import type { Block } from "../types";
import { MarkdownBlock } from "./MarkdownBlock";
import { useUiStore } from "../stores/ui-store";

function ToolInput({ input }: { input: unknown }) {
  const text =
    input && typeof input === "object"
      ? JSON.stringify(input, null, 2)
      : String(input ?? "");
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[10px] text-muted-foreground/60 hover:text-muted-foreground">
        input
      </summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs text-muted-foreground">
        {text}
      </pre>
    </details>
  );
}

function ToolResult({ result }: { result: unknown }) {
  if (result === null || result === undefined) return null;

  let text = "";
  if (typeof result === "string") {
    text = result;
  } else if (typeof result === "object" && result !== null) {
    // Try to extract text content
    const arr = (result as { content?: unknown[] }).content;
    if (Array.isArray(arr)) {
      text = arr
        .filter((c): c is { type: string; text?: string } => c && typeof c === "object")
        .map((c) => (c.type === "text" ? c.text ?? "" : ""))
        .join("\n");
    }
    if (!text) {
      text = JSON.stringify(result, null, 2);
    }
  } else {
    text = JSON.stringify(result, null, 2);
  }

  if (!text.trim()) return null;

  return (
    <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted/30 p-2 text-xs text-muted-foreground/90">
      {text}
    </pre>
  );
}

export function TextBlock({ block }: { block: Block & { type: "text" } }) {
  return <MarkdownBlock text={block.text} />;
}

export function ThinkingBlock({ block }: { block: Block & { type: "thinking" } }) {
  return (
    <details className="border-l-2 border-muted-foreground/20 pl-3">
      <summary className="cursor-pointer text-xs italic text-muted-foreground/50 hover:text-foreground/70">
        Thinking...
      </summary>
      <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
        {block.text}
      </div>
    </details>
  );
}

export function ToolCallBlock({ block }: { block: Block & { type: "tool_call" } }) {
  return (
    <details className="border-l-2 border-muted-foreground/20 pl-3">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground/60 hover:text-muted-foreground/80">
        {block.name || "tool_call"}
      </summary>
      <ToolInput input={block.input} />
    </details>
  );
}

export function ToolResultBlock({ block }: { block: Block & { type: "tool_result" } }) {
  return (
    <div className="border-l-2 border-muted-foreground/15 pl-3">
      <span className="text-xs font-medium text-muted-foreground/50">
        {block.name || "result"}
      </span>
      <ToolResult result={block.result} />
    </div>
  );
}

export function ToolCombinedBlock({ block }: { block: Block & { type: "tool_combined" } }) {
  return (
    <details className="border-l-2 border-muted-foreground/20 pl-3" open>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground/60 hover:text-muted-foreground/80">
        {block.name || "tool"}
      </summary>
      <ToolInput input={block.input} />
      <ToolResult result={block.result} />
    </details>
  );
}

export function ImageBlockView({ block }: { block: Block & { type: "image" } }) {
  const src = `data:${block.mimeType};base64,${block.data}`;
  const setOverlayImage = useUiStore((s) => s.setOverlayImage);
  return (
    <img
      src={src}
      alt=""
      className="max-h-80 max-w-full cursor-zoom-in rounded-lg border object-contain"
      onClick={() => setOverlayImage(src)}
    />
  );
}

export function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "text":
      return <TextBlock block={block} />;
    case "thinking":
      return <ThinkingBlock block={block} />;
    case "tool_call":
      return <ToolCallBlock block={block} />;
    case "tool_result":
      return <ToolResultBlock block={block} />;
    case "tool_combined":
      return <ToolCombinedBlock block={block} />;
    case "image":
      return <ImageBlockView block={block} />;
    default:
      return null;
  }
}
