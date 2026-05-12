import { useEffect, useRef, useState } from 'react';
import { createSession, streamMessage } from '../services/adkClient';
import type { ADKSession, ADKStreamEvent, ChatMessage, TextMessage, CarouselMessage, VoiceMessage, ImageMessage, CustomThemeColors, EventHandlers } from '../types';

function isEventType<T extends ADKStreamEvent['type']>(
  event: ADKStreamEvent,
  type: T,
): event is Extract<ADKStreamEvent, { type: T }> {
  return event.type === type;
}

export function createDispatcher(handlers: EventHandlers) {
  return (event: ADKStreamEvent, agentId: string, agentText: { current: string }) => {
    if (isEventType(event, 'text'))         return handlers.text?.(event, agentId, agentText);
    if (isEventType(event, 'carousel'))     return handlers.carousel?.(event, agentId, agentText);
    if (isEventType(event, 'agent_image'))  return handlers.agent_image?.(event, agentId, agentText);
    if (isEventType(event, 'theme'))        return handlers.theme?.(event, agentId, agentText);
    if (isEventType(event, 'custom_theme')) return handlers.custom_theme?.(event, agentId, agentText);
    if (isEventType(event, 'error'))        return handlers.error?.(event, agentId, agentText);
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const CSS_VAR_MAP: Record<keyof CustomThemeColors, string> = {
  /* Global */
  bgPrimary:           '--color-bg-primary',
  bgSecondary:         '--color-bg-secondary',
  border:              '--color-border',
  textPrimary:         '--color-text-primary',
  textMuted:           '--color-text-muted',
  textPlaceholder:     '--color-text-placeholder',
  accent:              '--color-accent',
  accentHover:         '--color-accent-hover',
  accentText:          '--color-accent-text',
  link:                '--color-link',
  /* Bubble-specific */
  bubbleUserBg:        '--color-bubble-user-bg',
  bubbleUserText:      '--color-bubble-user-text',
  bubbleAgentText:     '--color-bubble-agent-text',
  bubbleCodeBg:        '--color-bubble-code-bg',
  bubblePreBg:         '--color-bubble-pre-bg',
  bubbleTableBorder:   '--color-bubble-table-border',
  bubbleTableHeaderBg: '--color-bubble-table-header-bg',
  bubbleBlockquote:    '--color-bubble-blockquote',
  bubbleHr:            '--color-bubble-hr',
};

function clearCustomTheme() {
  const root = document.documentElement;
  for (const cssVar of Object.values(CSS_VAR_MAP)) {
    root.style.removeProperty(cssVar);
  }
}

function applyCustomTheme(colors: CustomThemeColors) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const value = colors[key as keyof CustomThemeColors];
    if (value) root.style.setProperty(cssVar, value);
  }
}

export function useADKSession(
  userId: string,
  appName: string,
  initialMessage?: string,
  options?: { onThemeChange?: (name: string) => void; enabled?: boolean; clock?: () => number },
) {
  const enabled = options?.enabled !== false;
  const now = options?.clock ?? Date.now;
  const sessionRef = useRef<ADKSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addMessage = (msg: ChatMessage) =>
    setMessages((prev) => [...prev, msg]);

  const handleEvent = createDispatcher({
    text: ({ content }, agentId, agentText) => {
      agentText.current += content;
      const text = agentText.current;
      const timestamp = now();
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === agentId);
        if (exists) return prev.map((m) => m.id === agentId ? { ...m, text } as TextMessage : m);
        return [...prev, { id: agentId, role: 'agent', type: 'text', text, timestamp } as TextMessage];
      });
    },
    carousel:     ({ items })      => addMessage({ id: uid(), role: 'agent', type: 'carousel', items, timestamp: now() } as CarouselMessage),
    agent_image:  ({ imageData })  => addMessage({ id: uid(), role: 'agent', type: 'image', imageUrl: `data:${imageData.mimeType};base64,${imageData.data}`, timestamp: now() } as ImageMessage),
    theme:        ({ themeName })  => { clearCustomTheme(); options?.onThemeChange?.(themeName); },
    custom_theme: ({ customThemeColors }) => applyCustomTheme(customThemeColors),
    error:        ({ error })      => setError(error),
  });

  const processStream = async (stream: AsyncGenerator<ADKStreamEvent>) => {
    const agentId = uid();
    const agentText = { current: '' };
    setStreaming(true);
    try {
      for await (const event of stream) handleEvent(event, agentId, agentText);
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  const sendText = async (text: string, opts?: { hideUserBubble?: boolean }) => {
    if (!sessionRef.current) return;
    setError(null);
    if (!opts?.hideUserBubble) addMessage({ id: uid(), role: 'user', type: 'text', text, timestamp: now() } as TextMessage);
    await processStream(streamMessage(sessionRef.current, text));
  };

  const sendVoiceMessage = async (msg: VoiceMessage) => {
    if (!sessionRef.current || !msg.audioBlob) return;
    setError(null);
    addMessage(msg);
    await processStream(streamMessage(sessionRef.current, msg.transcript ?? '', msg.audioBlob));
  };

  const sendImageMessage = async (msg: ImageMessage) => {
    if (!sessionRef.current || !msg.imageBlob) return;
    setError(null);
    addMessage(msg);
    await processStream(streamMessage(sessionRef.current, msg.caption ?? '', msg.imageBlob));
  };

  const clearMessages = () => setMessages([]);

   useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    sessionRef.current = null;

    createSession(userId, appName)
      .then((s) => {
        if (cancelled) return;
        sessionRef.current = s;
        if (initialMessage) sendText(initialMessage, { hideUserBubble: true });
      })
      .catch((e) => { if (!cancelled) setError(String(e)); });

    return () => { cancelled = true; };
  // initialMessage intentionally excluded — fire once on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, appName]);

  return { messages, streaming, error, sendText, sendVoiceMessage, sendImageMessage, clearMessages };
}
