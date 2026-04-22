import { useEffect, useRef, useState, useCallback } from 'react';
import { createSession } from '../services/adkClient';
import type { ADKSession, ChatMessage, TextMessage, VoiceMessage, ImageMessage } from '../types';

const ADK_BASE_URL = import.meta.env.VITE_ADK_BASE_URL ?? 'http://localhost:8000';
const WS_BASE_URL = ADK_BASE_URL.replace(/^http/, 'ws');

const REC_SAMPLE_RATE = 16000;
const PLAY_SAMPLE_RATE = 24000; // CSM/OmniVoice output rate

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function useLiveSession(
  userId: string,
  appName: string,
  initialMessage?: string,
  options?: { onThemeChange?: (name: string) => void; enabled?: boolean },
) {
  const enabled = options?.enabled !== false;
  const sessionRef = useRef<ADKSession | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Mic audio graph (16 kHz AudioWorklet)
  const micCtxRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recorderNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Playback audio graph (24 kHz AudioWorklet ring buffer)
  const playCtxRef = useRef<AudioContext | null>(null);
  const playerNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  const agentTextRef = useRef('');
  const agentIdRef = useRef(uid());

  // ── Mic ──────────────────────────────────────────────────────────────────

  const stopMic = useCallback(() => {
    recorderNodeRef.current?.disconnect();
    micSourceRef.current?.disconnect();
    micCtxRef.current?.close();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    recorderNodeRef.current = null;
    micSourceRef.current = null;
    micCtxRef.current = null;
    micStreamRef.current = null;
    setMicActive(false);
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      micStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: REC_SAMPLE_RATE });
      micCtxRef.current = ctx;

      await ctx.audioWorklet.addModule('/pcm-recorder-processor.js');

      const source = ctx.createMediaStreamSource(stream);
      micSourceRef.current = source;

      const recorderNode = new AudioWorkletNode(ctx, 'pcm-recorder-processor');
      recorderNodeRef.current = recorderNode;

      recorderNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || mutedRef.current) return;
        const float32 = e.data;
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
        }
        ws.send(int16.buffer);
      };

      source.connect(recorderNode);
      // Silent gain keeps the worklet in the rendering graph without echo.
      const silent = ctx.createGain();
      silent.gain.value = 0;
      recorderNode.connect(silent);
      silent.connect(ctx.destination);

      setMicActive(true);
    } catch (e) {
      setError(`Microphone error: ${e}`);
    }
  }, []);

  // ── Message handler ───────────────────────────────────────────────────────

  const handleWsMessage = useCallback((event: MessageEvent) => {
    if (typeof event.data !== 'string') return;

    try {
      const msg = JSON.parse(event.data as string);
      console.log('[WS]', JSON.stringify(msg).slice(0, 300));

      // ADK bidi event envelope — content.parts holds text and/or audio
      const parts: Array<Record<string, unknown>> =
        (msg.content as { parts?: Array<Record<string, unknown>> })?.parts ?? [];

      // CSM TTS audio — inlineData with audio/pcm
      for (const part of parts) {
        const inline = part.inlineData as { mimeType?: string; data?: string } | undefined;
        if (inline?.mimeType?.startsWith('audio/pcm') && inline.data) {
          playerNodeRef.current?.port.postMessage(base64ToArrayBuffer(inline.data));
        }
      }

      // User audio transcription (author: 'user', content.parts[].text)
      if (msg.author === 'user') {
        for (const part of parts) {
          if (typeof part.text === 'string' && part.text) {
            setMessages((prev) => [...prev, {
              id: uid(), role: 'user', type: 'text', text: part.text as string, timestamp: Date.now(),
            } as TextMessage]);
          }
        }
      }

      // Agent text from ADK bidi event (author != 'user', content.parts[].text)
      if (msg.author && msg.author !== 'user') {
        for (const part of parts) {
          if (typeof part.text === 'string' && part.text) {
            const id = agentIdRef.current;
            agentTextRef.current += part.text as string;
            setStreaming(true);
            setMessages((prev) => {
              const existing = prev.find((m) => m.id === id);
              if (existing) {
                return prev.map((m) =>
                  m.id === id ? { ...m, text: agentTextRef.current } as TextMessage : m,
                );
              }
              return [...prev, {
                id, role: 'agent', type: 'text', text: agentTextRef.current, timestamp: Date.now(),
              } as TextMessage];
            });
          }
        }
      }

      if (msg.partial === false) {
        agentTextRef.current = '';
        agentIdRef.current = uid();
        setStreaming(false);
      }

      if (msg.type === 'theme' && msg.name) {
        options?.onThemeChange?.(msg.name as string);
      }
    } catch {
      // non-JSON frame, ignore
    }
  }, [options]);

  // ── Session lifecycle ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function setup() {
      // Init playback AudioWorklet ring buffer
      const ctx = new AudioContext({ sampleRate: PLAY_SAMPLE_RATE });
      await ctx.audioWorklet.addModule('/pcm-player-processor.js');
      const playerNode = new AudioWorkletNode(ctx, 'pcm-player-processor');
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      playerNode.connect(analyser);
      analyser.connect(ctx.destination);
      if (cancelled) { ctx.close(); return; }
      playCtxRef.current = ctx;
      playerNodeRef.current = playerNode;
      analyserRef.current = analyser;

      const session = await createSession(userId, appName);
      if (cancelled) return;
      sessionRef.current = session;

      const ws = new WebSocket(`${WS_BASE_URL}/ws/${session.userId}/${session.sessionId}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
      ws.onmessage = handleWsMessage;
      ws.onerror = () => { if (!cancelled) setError('WebSocket error'); };
      ws.onclose = () => { if (!cancelled) wsRef.current = null; };
      ws.onopen = () => {
        if (initialMessage) sendText(initialMessage, { hideUserBubble: true });
        startMic();
      };
    }

    setup().catch((e) => { if (!cancelled) setError(String(e)); });

    return () => {
      cancelled = true;
      stopMic();
      wsRef.current?.close();
      wsRef.current = null;
      playCtxRef.current?.close();
      playCtxRef.current = null;
      playerNodeRef.current = null;
      analyserRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, appName, enabled]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const sendText = (text: string, opts?: { hideUserBubble?: boolean }) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!opts?.hideUserBubble) {
      setMessages((prev) => [...prev, {
        id: uid(), role: 'user', type: 'text', text, timestamp: Date.now(),
      } as TextMessage]);
    }
    agentTextRef.current = '';
    agentIdRef.current = uid();
    setStreaming(true);
    ws.send(JSON.stringify({ type: 'text', text }));
  };

  const sendVoiceMessage = (msg: VoiceMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !msg.audioBlob) return;
    setMessages((prev) => [...prev, msg]);
    agentTextRef.current = '';
    agentIdRef.current = uid();
    setStreaming(true);
    msg.audioBlob.arrayBuffer().then((buf) => ws.send(buf));
  };

  const sendImageMessage = (msg: ImageMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !msg.imageBlob) return;
    setMessages((prev) => [...prev, msg]);
    agentTextRef.current = '';
    agentIdRef.current = uid();
    setStreaming(true);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1];
      ws.send(JSON.stringify({ type: 'image', data: b64, mimeType: msg.imageBlob!.type }));
    };
    reader.readAsDataURL(msg.imageBlob);
  };

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
  }, []);

  const clearMessages = () => setMessages([]);

  return {
    messages, streaming, error,
    sendText, sendVoiceMessage, sendImageMessage, clearMessages,
    micActive, startMic, stopMic,
    muted, toggleMute,
    analyserRef,
  };
}
