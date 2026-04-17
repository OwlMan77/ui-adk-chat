// ------------------------------------------------------------
// ADK REST API DTOs
// Based on https://adk.dev/api-reference/rest/
// ------------------------------------------------------------

// --- Primitives ---

export interface Blob {
  mimeType: string;
  data?: string;          // base64-encoded
  displayName?: string;
}

export interface FileData {
  mimeType: string;
  fileUri: string;
}

export interface FunctionCall {
  name: string;
  args?: Record<string, unknown>;
}

export interface FunctionResponse {
  name: string;
  response?: Record<string, unknown>;
}

// --- Content / Parts ---

export interface PartInput {
  text?: string;
  inlineData?: Blob;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  fileData?: FileData;
}

export interface PartOutput {
  text?: string;
  inlineData?: Blob;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  fileData?: FileData;
}

export interface Content {
  role: string;           // 'user' | 'model'
  parts: PartInput[];
}

export interface ContentOutput {
  role: string;
  parts: PartOutput[];
}

// --- Request ---

export interface RunAgentRequest {
  appName: string;
  userId: string;
  sessionId?: string | null;
  newMessage?: Content;
  streaming?: boolean;
  stateDelta?: Record<string, unknown>;
  functionCallEventId?: string;
  invocationId?: string;
}

// --- Response / Events ---

export interface EventOutput {
  id: string;
  type: string;
  timestamp: number;
  partial?: boolean;
  content?: ContentOutput;
  toolUse?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
}

/** POST /run → array of events */
export type RunAgentResponse = EventOutput[];

// --- SSE streaming ---
// POST /run_sse emits newline-delimited `data: <json>` lines.
// Each line deserialises to one of these shapes:

export interface SSETextEvent {
  type: 'text';
  content: string;
}

export interface SSECarouselEvent {
  type: 'carousel';
  items: unknown[];       // replace `unknown` with your product type
}

export interface SSEDoneEvent {
  type: 'done';
}

export interface SSEErrorEvent {
  type: 'error';
  error: string;
}

export type SSEEvent = SSETextEvent | SSECarouselEvent | SSEDoneEvent | SSEErrorEvent;
