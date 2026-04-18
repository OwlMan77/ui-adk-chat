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

export interface ADKStreamEvent {
  type: 'text' | 'carousel' | 'done' | 'error' | 'theme';
  content?: string;
  items?: CarouselItem[];
  error?: string;
  themeName?: string;
}
