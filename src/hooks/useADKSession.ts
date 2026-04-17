import { useEffect, useRef, useState } from 'react';
import { createSession, streamMessage } from '../services/adkClient';
import type { ADKSession, ChatMessage, TextMessage, CarouselMessage, VoiceMessage, ImageMessage } from '../types';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function useADKSession(
  userId: string,
  appName: string,
  initialMessage?: string,
  options?: { onThemeChange?: (name: string) => void },
) {
  const sessionRef = useRef<ADKSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  // initialMessage is intentionally excluded — we only want to fire it once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, appName]);

  const addMessage = (msg: ChatMessage) =>
    setMessages((prev) => [...prev, msg]);

  const sendText = async (text: string, opts?: { hideUserBubble?: boolean }) => {
    if (!sessionRef.current) return;
    setError(null);

    if (!opts?.hideUserBubble) {
      const userMsg: TextMessage = {
        id: uid(),
        role: 'user',
        type: 'text',
        text,
        timestamp: Date.now(),
      };
      addMessage(userMsg);
    }

    setStreaming(true);
    let agentText = '';
    const agentId = uid();

    try {
      for await (const event of streamMessage(sessionRef.current, text)) {
        if (event.type === 'text' && event.content) {
          agentText += event.content;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === agentId);
            if (existing) {
              return prev.map((m) =>
                m.id === agentId ? { ...m, text: agentText } as TextMessage : m
              );
            }
            const agentMsg: TextMessage = {
              id: agentId,
              role: 'agent',
              type: 'text',
              text: agentText,
              timestamp: Date.now(),
            };
            return [...prev, agentMsg];
          });
        } else if (event.type === 'carousel' && event.items) {
          const carouselMsg: CarouselMessage = {
            id: uid(),
            role: 'agent',
            type: 'carousel',
            items: event.items,
            timestamp: Date.now(),
          };
          addMessage(carouselMsg);
        } else if (event.type === 'theme' && event.themeName) {
          options?.onThemeChange?.(event.themeName);
        } else if (event.type === 'error') {
          setError(event.error ?? 'Unknown error');
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  const sendVoiceMessage = async (msg: VoiceMessage) => {
    if (!sessionRef.current || !msg.audioBlob) return;
    addMessage(msg);
    setError(null);
    setStreaming(true);
    let agentText = '';
    const agentId = uid();

    try {
      for await (const event of streamMessage(sessionRef.current, msg.transcript ?? '', msg.audioBlob)) {
        if (event.type === 'text' && event.content) {
          agentText += event.content;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === agentId);
            if (existing) {
              return prev.map((m) =>
                m.id === agentId ? { ...m, text: agentText } as TextMessage : m
              );
            }
            return [...prev, { id: agentId, role: 'agent', type: 'text', text: agentText, timestamp: Date.now() } as TextMessage];
          });
        } else if (event.type === 'carousel' && event.items) {
          addMessage({ id: uid(), role: 'agent', type: 'carousel', items: event.items, timestamp: Date.now() } as CarouselMessage);
        } else if (event.type === 'theme' && event.themeName) {
          options?.onThemeChange?.(event.themeName);
        } else if (event.type === 'error') {
          setError(event.error ?? 'Unknown error');
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  const sendImageMessage = async (msg: ImageMessage) => {
    if (!sessionRef.current || !msg.imageBlob) return;
    addMessage(msg);
    setError(null);
    setStreaming(true);
    let agentText = '';
    const agentId = uid();

    try {
      for await (const event of streamMessage(sessionRef.current, msg.caption ?? '', msg.imageBlob)) {
        if (event.type === 'text' && event.content) {
          agentText += event.content;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === agentId);
            if (existing) {
              return prev.map((m) =>
                m.id === agentId ? { ...m, text: agentText } as TextMessage : m
              );
            }
            return [...prev, { id: agentId, role: 'agent', type: 'text', text: agentText, timestamp: Date.now() } as TextMessage];
          });
        } else if (event.type === 'carousel' && event.items) {
          addMessage({ id: uid(), role: 'agent', type: 'carousel', items: event.items, timestamp: Date.now() } as CarouselMessage);
        } else if (event.type === 'theme' && event.themeName) {
          options?.onThemeChange?.(event.themeName);
        } else if (event.type === 'error') {
          setError(event.error ?? 'Unknown error');
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  const clearMessages = () => setMessages([]);

  return { messages, streaming, error, sendText, sendVoiceMessage, sendImageMessage, clearMessages };
}
