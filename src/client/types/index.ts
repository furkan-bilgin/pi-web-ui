// ---- Session types ----

export interface SessionState {
  cwd: string;
  sessionId: string;
  sessionFile: string | null;
  sessionName: string | null;
  thinkingLevel: string;
  isStreaming: boolean;
  isCompacting: boolean;
  autoCompactionEnabled: boolean;
  steeringMode: boolean;
  followUpMode: boolean;
  activeTools: string[];
  toolCount: number;
  messageCount: number;
  contextUsage: ContextUsage | null;
  model: ModelInfo | null;
}

export interface ContextUsage {
  percent: number;
  contextWindow: number;
}

export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

export interface SessionInfo {
  id: string;
  path: string;
  name?: string;
  firstMessage?: string;
  cwd?: string;
  created: string;
  modified: string;
  messageCount?: number;
}

export interface SlashCommand {
  name: string;
  description: string;
  source: string;
  supported: boolean;
  argumentHint?: string;
}

// ---- Message / Block types ----

export type Block =
  | TextBlock
  | ThinkingBlock
  | ToolCallBlock
  | ToolResultBlock
  | ToolCombinedBlock
  | ImageBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  text: string;
}

export interface ToolCallBlock {
  type: "tool_call";
  id?: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  id?: string;
  name: string;
  result: unknown;
}

export interface ToolCombinedBlock {
  type: "tool_combined";
  name: string;
  input: unknown;
  result: unknown;
}

export interface ImageBlock {
  type: "image";
  mimeType: string;
  data: string;
}

export interface Message {
  role: "user" | "assistant" | "toolResult" | "bashExecution" | "custom" | string;
  content: string | ContentItem[];
  _entryId?: string;
  toolName?: string;
  command?: string;
  output?: string;
  exitCode?: number;
  summary?: string;
  customType?: string;
  details?: unknown;
}

export interface ContentItem {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: unknown;
  toolName?: string;
  content?: unknown;
  details?: unknown;
  mimeType?: string;
  data?: string;
}

// ---- Rendering types ----

export type RenderItem =
  | { source: "canonical"; message: Message }
  | { source: "extra"; item: ExtraItem }
  | { source: "typing" };

export interface ExtraItem {
  kind: "user" | "assistant" | "tool" | "error" | "system";
  title: string;
  blocks: Block[];
}

export interface MessageDelta {
  type: "text_delta" | "thinking_delta" | "toolcall_end";
  delta?: string;
  contentIndex?: number;
  toolCall?: {
    id: string;
    name: string;
    arguments: unknown;
  };
}

// ---- Connection types ----

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";
