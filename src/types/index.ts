export type MessageRole = 'user' | 'agent';

export type MessageType = 'text' | 'carousel' | 'voice' | 'image';

export interface BaseMessage {
  id: string;
  role: MessageRole;
  type: MessageType;
  timestamp: number;
}

export interface TextMessage extends BaseMessage {
  type: 'text';
  text: string;
}

export interface CarouselItem {
  id: string;
  imageUrl?: string;
  content: string;
  actionLabel?: string;
  actionUrl?: string;
}

export interface CarouselMessage extends BaseMessage {
  type: 'carousel';
  items: CarouselItem[];
}

export interface VoiceMessage extends BaseMessage {
  type: 'voice';
  audioBlob?: Blob;
  audioUrl?: string;
  durationMs?: number;
  transcript?: string;
}

export interface ImageMessage extends BaseMessage {
  type: 'image';
  imageBlob?: Blob;
  imageUrl: string;
  caption?: string;
}

export type ChatMessage = TextMessage | CarouselMessage | VoiceMessage | ImageMessage;

export interface AppInfo {
  name: string;
  live: boolean;
}

export interface ADKSession {
  sessionId: string;
  userId: string;
  appName: string;
}

export interface ADKSendPayload {
  message: string;
  sessionId: string;
  userId: string;
}

export interface CustomThemeColors {
  /* Global */
  bgPrimary?: string;
  bgSecondary?: string;
  border?: string;
  textPrimary?: string;
  textMuted?: string;
  textPlaceholder?: string;
  accent?: string;
  accentHover?: string;
  accentText?: string;
  link?: string;
  /* Bubble-specific */
  bubbleUserBg?: string;
  bubbleUserText?: string;
  bubbleAgentText?: string;
  bubbleCodeBg?: string;
  bubblePreBg?: string;
  bubbleTableBorder?: string;
  bubbleTableHeaderBg?: string;
  bubbleBlockquote?: string;
  bubbleHr?: string;
}

export type ADKStreamEvent =
  | { type: 'text';         content: string }
  | { type: 'carousel';     items: CarouselItem[] }
  | { type: 'agent_image';  imageData: { mimeType: string; data: string } }
  | { type: 'theme';        themeName: string }
  | { type: 'custom_theme'; customThemeColors: CustomThemeColors }
  | { type: 'error';        error: string }
  | { type: 'done' };

export type Handler<T extends ADKStreamEvent> = (event: T, agentId: string, agentText: { current: string }) => void;

export type EventHandlers = { [E in ADKStreamEvent as E['type']]?: Handler<E> };
