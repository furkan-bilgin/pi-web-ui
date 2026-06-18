import React, { useMemo, useState, useRef, useEffect } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Ban, ChevronRight, Code2, Loader2, Terminal } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { FilePreview } from "@/components/ui/file-preview"
import { MarkdownRenderer } from "@/components/ui/markdown-renderer"
import { useUiStore } from "@/stores/ui-store"

const chatBubbleVariants = cva(
  "group/message relative break-words rounded-lg p-3 text-base leading-relaxed sm:max-w-[70%]",
  {
    variants: {
      isUser: {
        true: "bg-primary text-primary-foreground",
        false: "",
      },
      animation: {
        none: "",
        slide: "duration-300 animate-in fade-in-0",
        scale: "duration-300 animate-in fade-in-0 zoom-in-75",
        fade: "duration-500 animate-in fade-in-0",
      },
    },
    compoundVariants: [
      {
        isUser: true,
        animation: "slide",
        class: "slide-in-from-right",
      },
      {
        isUser: false,
        animation: "slide",
        class: "slide-in-from-left",
      },
      {
        isUser: true,
        animation: "scale",
        class: "origin-bottom-right",
      },
      {
        isUser: false,
        animation: "scale",
        class: "origin-bottom-left",
      },
    ],
  }
)

const assistantTextClass = "w-full px-4 py-2 text-base leading-relaxed";

type Animation = VariantProps<typeof chatBubbleVariants>["animation"]

interface Attachment {
  name?: string
  contentType?: string
  url: string
}

interface PartialToolCall {
  state: "partial-call"
  toolName: string
}

interface ToolCall {
  state: "call"
  toolName: string
}

interface ToolResult {
  state: "result"
  toolName: string
  result: {
    __cancelled?: boolean
    [key: string]: any
  }
}

type ToolInvocation = PartialToolCall | ToolCall | ToolResult

interface ReasoningPart {
  type: "reasoning"
  reasoning: string
}

interface ToolInvocationPart {
  type: "tool-invocation"
  toolInvocation: ToolInvocation
}

interface TextPart {
  type: "text"
  text: string
}

// For compatibility with AI SDK types, not used
interface SourcePart {
  type: "source"
  source?: any
}

interface FilePart {
  type: "file"
  mimeType: string
  data: string
}

interface StepStartPart {
  type: "step-start"
}

type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolInvocationPart
  | SourcePart
  | FilePart
  | StepStartPart

export interface Message {
  id: string
  role: "user" | "assistant" | (string & {})
  content: string
  createdAt?: Date
  experimental_attachments?: Attachment[]
  toolInvocations?: ToolInvocation[]
  parts?: MessagePart[]
}

export interface ChatMessageProps extends Message {
  showTimeStamp?: boolean
  animation?: Animation
  actions?: React.ReactNode
  onRevert?: (id: string) => void
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  id,
  role,
  content,
  createdAt,
  showTimeStamp = false,
  animation = "scale",
  actions,
  experimental_attachments,
  toolInvocations,
  parts,
  onRevert,
}) => {
  const files = useMemo(() => {
    return experimental_attachments?.map((attachment) => {
      const dataArray = dataUrlToUint8Array(attachment.url)
      const file = new File([dataArray], attachment.name ?? "Unknown", {
        type: attachment.contentType,
      })
      return file
    })
  }, [experimental_attachments])

  const isUser = role === "user"

  const formattedTime = createdAt?.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })

  // User messages: right-aligned chat bubble
  if (isUser) {
    return (
      <div className="group/revert flex flex-col items-end">
        {experimental_attachments && experimental_attachments.length > 0 ? (
          <div className="mb-1 flex flex-wrap gap-2">
            {experimental_attachments.map((att, index) => (
              <img
                key={index}
                src={att.url}
                alt={att.name || "attachment"}
                className="h-16 w-16 cursor-zoom-in rounded-lg border object-cover"
                onClick={() => useUiStore.getState().setOverlayImage(att.url)}
              />
            ))}
          </div>
        ) : null}

        <div className={cn(chatBubbleVariants({ isUser, animation }))}>
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </div>

        {showTimeStamp && createdAt ? (
          <time
            dateTime={createdAt.toISOString()}
            className={cn(
              "mt-1 block px-1 text-xs opacity-50",
              animation !== "none" && "duration-500 animate-in fade-in-0"
            )}
          >
            {formattedTime}
          </time>
        ) : null}
        {onRevert && (
          <button
            type="button"
            onClick={() => onRevert(id)}
            className="mt-1 flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:border-foreground/30 hover:text-foreground group-hover/revert:opacity-100"
            title="Revert to this message (navigate tree)"
          >
            ↩ revert
          </button>
        )}
      </div>
    )
  }

  // Assistant messages: full width (no bubble)
  if (parts && parts.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <div key={`text-${index}`} className={cn(assistantTextClass)}>
                <MarkdownRenderer>{part.text}</MarkdownRenderer>
                {actions ? (
                  <div className="absolute -bottom-4 right-2 flex space-x-1 rounded-lg border bg-background p-1 text-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
                    {actions}
                  </div>
                ) : null}
              </div>
            )
          } else if (part.type === "reasoning") {
            const hasNext = index < parts.length - 1
            return <ReasoningBlock key={`reasoning-${index}`} part={part} hasFollowingBlock={hasNext} />
          } else if (part.type === "tool-invocation") {
            return (
              <ToolCall
                key={`tool-${index}`}
                toolInvocations={[part.toolInvocation]}
              />
            )
          } else if (part.type === "file") {
            const src = part.data.startsWith("data:")
              ? part.data
              : `data:${part.mimeType};base64,${part.data}`;
            return (
              <img
                key={`file-${index}`}
                src={src}
                alt=""
                className="max-h-80 max-w-full cursor-zoom-in rounded-lg border object-contain"
                onClick={() => useUiStore.getState().setOverlayImage(src)}
              />
            )
          }
          return null
        })}
        {showTimeStamp && createdAt ? (
          <time
            dateTime={createdAt.toISOString()}
            className={cn(
              "mt-1 block px-1 text-xs opacity-50",
              animation !== "none" && "duration-500 animate-in fade-in-0"
            )}
          >
            {formattedTime}
          </time>
        ) : null}
      </div>
    )
  }

  // Fallback: no parts, just toolInvocations or content
  if (toolInvocations && toolInvocations.length > 0) {
    return <ToolCall toolInvocations={toolInvocations} />
  }

  return (
    <div className="flex flex-col">
      <div className={cn(assistantTextClass)}>
        <MarkdownRenderer>{content}</MarkdownRenderer>
        {actions ? (
          <div className="absolute -bottom-4 right-2 flex space-x-1 rounded-lg border bg-background p-1 text-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
            {actions}
          </div>
        ) : null}
      </div>
      {showTimeStamp && createdAt ? (
        <time
          dateTime={createdAt.toISOString()}
          className={cn(
            "mt-1 block px-1 text-xs opacity-50",
            animation !== "none" && "duration-500 animate-in fade-in-0"
          )}
        >
          {formattedTime}
        </time>
      ) : null}
    </div>
  )
}

function dataUrlToUint8Array(data: string) {
  const base64 = data.split(",")[1]
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

const ReasoningBlock = ({ part, hasFollowingBlock = false }: { part: ReasoningPart; hasFollowingBlock?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [streaming, setStreaming] = useState(false)
  const startRef = useRef(Date.now())
  const initialLen = useRef(part.reasoning.length)

  // Detect streaming: if text grows after mount, it's a live block.
  // Historical blocks have their full text from the start.
  useEffect(() => {
    if (part.reasoning.length > initialLen.current) {
      setStreaming(true)
      setIsOpen(true) // auto-open thinking when streaming starts
    }
  }, [part.reasoning.length])

  // Stop streaming when a following block appears (e.g. text or tool call)
  // or when text stops growing for 1.5s (fallback).
  useEffect(() => {
    if (hasFollowingBlock) setStreaming(false)
  }, [hasFollowingBlock])

  // Timer only runs while streaming
  useEffect(() => {
    if (!streaming) return
    startRef.current = Date.now()
    setElapsed(0)
    const id = setInterval(() => {
      setElapsed(Date.now() - startRef.current)
    }, 200)
    return () => clearInterval(id)
  }, [streaming])

  return (
    <div className="w-full">
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="group w-full overflow-hidden rounded-lg border bg-muted/50"
      >
        <div className="flex items-center p-2">
          <CollapsibleTrigger render={<button className="flex flex-1 items-center gap-2 text-sm text-muted-foreground hover:text-foreground" />}>
            <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            <span>Thinking</span>
            {streaming && (
              <span className="text-xs tabular-nums text-muted-foreground/60">
                {formatElapsed(elapsed)}
              </span>
            )}
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          {isOpen && (
            <div className="border-t p-2">
              <div className="whitespace-pre-wrap text-sm">
                {part.reasoning}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

/** Format a tool result for human-friendly display instead of raw JSON. */
function formatResultPreview(result: unknown): string {
  if (result == null) return "(no output)"
  if (typeof result === "string") {
    const trimmed = result.trim()
    return trimmed || "(no output)"
  }
  if (Array.isArray(result)) {
    // Filter out empty text items, join meaningful text
    const parts: string[] = []
    for (const item of result) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        if (obj.type === "text" && typeof obj.text === "string") {
          const t = (obj.text as string).trim()
          if (t) parts.push(t)
        }
      } else if (item != null) {
        parts.push(String(item).trim())
      }
    }
    return parts.length > 0 ? parts.join("\n") : "(no output)"
  }
  if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>
    if (obj.type === "image" || (typeof obj.mimeType === "string" && obj.mimeType.startsWith("image/"))) {
      return "(image)"
    }
    if (obj.type === "text" && typeof obj.text === "string") {
      return (obj.text as string).trim() || "(no output)"
    }
    if (obj.__cancelled) return "(cancelled)"
    // Try common fields
    if (typeof obj.output === "string") return obj.output.trim() || "(no output)"
    if (typeof obj.content === "string") return obj.content.trim() || "(no output)"
    if (Array.isArray(obj.content)) {
      const texts: string[] = []
      for (const item of obj.content) {
        if (item && typeof item === "object" && (item as Record<string, unknown>).type === "text") {
          const t = ((item as Record<string, unknown>).text as string) || ""
          if (t.trim()) texts.push(t.trim())
        }
      }
      if (texts.length > 0) return texts.join("\n")
      return "(no output)"
    }
    // Last resort: compact JSON
    const s = JSON.stringify(obj)
    return s.length > 200 ? s.slice(0, 200) + "..." : s
  }
  const s = String(result).trim()
  return s || "(no output)"
}

/** Check if a result contains image data. */
function resultHasImages(result: unknown): boolean {
  if (!result || typeof result !== "object") return false
  if (Array.isArray(result)) {
    return result.some(
      (item) =>
        item &&
        typeof item === "object" &&
        ((item as Record<string, unknown>).type === "image" ||
          (item as Record<string, unknown>).mimeType?.toString().startsWith("image/"))
    )
  }
  const obj = result as Record<string, unknown>
  return (
    obj.type === "image" ||
    (typeof obj.mimeType === "string" && obj.mimeType.startsWith("image/"))
  )
}

function ToolCall({
  toolInvocations,
}: Pick<ChatMessageProps, "toolInvocations">) {
  if (!toolInvocations?.length) return null

  return (
    <div className="flex flex-col gap-2">
      {toolInvocations.map((invocation, index) => {
        const isCancelled =
          invocation.state === "result" &&
          invocation.result?.__cancelled === true

        if (isCancelled) {
          return (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
            >
              <Ban className="h-4 w-4" />
              <span>
                Cancelled{" "}
                <span className="font-mono">
                  {"`"}
                  {invocation.toolName}
                  {"`"}
                </span>
              </span>
            </div>
          )
        }

        switch (invocation.state) {
          case "partial-call":
          case "call":
            return (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
              >
                <Terminal className="h-4 w-4" />
                <span>
                  Calling{" "}
                  <span className="font-mono">
                    {"`"}
                    {invocation.toolName}
                    {"`"}
                  </span>
                  ...
                </span>
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>
            )
          case "result": {
            const hasImages = resultHasImages(invocation.result)
            return (
              <ToolResultCollapsible
                key={index}
                toolName={invocation.toolName}
                result={invocation.result}
                defaultOpen={hasImages}
              />
            )
          }
          default:
            return null
        }
      })}
    </div>
  )
}

/** Extract image items from a tool result. */
function extractImages(result: Record<string, unknown>): Array<{ src: string; mimeType?: string }> {
  const images: Array<{ src: string; mimeType?: string }> = [];

  if (Array.isArray(result)) {
    for (const item of result) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      if (obj.type === "image" || (typeof obj.mimeType === "string" && obj.mimeType.startsWith("image/"))) {
        if (typeof obj.data === "string") {
          const mime = (obj.mimeType as string) || "image/png";
          const src = obj.data.startsWith("data:") ? obj.data : `data:${mime};base64,${obj.data}`;
          images.push({ src, mimeType: mime });
        } else if (typeof obj.url === "string") {
          images.push({ src: obj.url, mimeType: obj.mimeType as string });
        }
      }
    }
  } else if (typeof result === "object" && result !== null) {
    const obj = result;
    if (obj.type === "image" || (typeof obj.mimeType === "string" && obj.mimeType.startsWith("image/"))) {
      if (typeof obj.data === "string") {
        const mime = (obj.mimeType as string) || "image/png";
        const src = obj.data.startsWith("data:") ? obj.data : `data:${mime};base64,${obj.data}`;
        images.push({ src, mimeType: mime });
      } else if (typeof obj.url === "string") {
        images.push({ src: obj.url, mimeType: obj.mimeType as string });
      }
    }
  }

  return images;
}

function ToolResultCollapsible({
  toolName,
  result,
  defaultOpen,
}: {
  toolName: string
  result: Record<string, unknown>
  defaultOpen: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const preview = formatResultPreview(result)
  const images = useMemo(() => extractImages(result), [result])

  return (
    <div className="w-full">
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="group w-full overflow-hidden rounded-lg border bg-muted/50"
      >
        <div className="flex items-center p-2">
          <CollapsibleTrigger render={<button className="flex flex-1 items-center gap-2 text-sm text-muted-foreground hover:text-foreground" />}>
            <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            <Code2 className="h-4 w-4 shrink-0" />
            <span className="font-mono text-xs">{"`"}{toolName}{"`"}</span>
            <span className="truncate text-xs text-muted-foreground/70">
              {images.length > 0
                ? `${images.length} image${images.length > 1 ? "s" : ""}`
                : preview.split("\n")[0] || "(no output)"}
            </span>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          {isOpen && (
            <div className="border-t p-2">
              {images.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    <img
                      key={i}
                      src={img.src}
                      alt={`${toolName} result ${i + 1}`}
                      className="max-h-80 max-w-full cursor-zoom-in rounded object-contain"
                      onClick={() => useUiStore.getState().setOverlayImage(img.src)}
                    />
                  ))}
                </div>
              )}
              {preview && (
                <pre className="overflow-x-auto whitespace-pre-wrap text-sm text-foreground">
                  {preview}
                </pre>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
