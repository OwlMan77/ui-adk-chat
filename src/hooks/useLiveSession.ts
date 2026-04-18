import { useEffect, useRef, useState, useCallback } from 'react';
import { createSession } from '../services/adkClient';
import type { ADKSession, ChatMessage, TextMessage, VoiceMessage, ImageMessage } from '../types';

const ADK_BASE_URL = import.meta.env.VITE_ADK_BASE_URL ?? 'http://localhost:8000';
const WS_BASE_URL = ADK_BASE_URL.replace(/^http/, 'ws');

const MIC_SAMPLE_RATE = 16000;

function uid() {
  return Math.random().toString(36).slice(2, 10);
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

  // Mic audio graph
  const micCtxRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Playback audio graph (for visualisation)
  const playCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  const agentTextRef = useRef('');
  const agentIdRef = useRef(uid());

  const getPlayCtx = useCallback(() => {
    if (!playCtxRef.current || playCtxRef.current.state === 'closed') {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyser.connect(ctx.destination);
      playCtxRef.current = ctx;
      analyserRef.current = analyser;
    }
    return { ctx: playCtxRef.current, analyser: analyserRef.current! };
  }, []);

  const playAudio = useCallback((bytes: ArrayBuffer) => {
    const { ctx, analyser } = getPlayCtx();
    ctx.decodeAudioData(bytes.slice(0), (buffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      source.start();
    });
  }, [getPlayCtx]);

  const handleWsMessage = useCallback((event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      playAudio(event.data);
      return;
    }
    if (event.data instanceof Blob) {
      event.data.arrayBuffer().then(playAudio);
      return;
    }

    try {
      const data = JSON.parse(event.data as string);
      const parts = typeof data.content === 'object' ? data.content?.parts ?? [] : [];
      const text = parts.map((p: { text?: string }) => p.text ?? '').join('');

      if (text) {
        agentTextRef.current += text;
        const id = agentIdRef.current;
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === id);
          if (existing) {
            return prev.map((m) =>
              m.id === id ? { ...m, text: agentTextRef.current } as TextMessage : m
            );
          }
          return [...prev, {
            id,
            role: 'agent',
            type: 'text',
            text: agentTextRef.current,
            timestamp: Date.now(),
          } as TextMessage];
        });
      }

      if (data.partial === false) {
        agentTextRef.current = '';
        agentIdRef.current = uid();
        setStreaming(false);
      }

      if (data.type === 'theme' && data.name) {
        options?.onThemeChange?.(data.name);
      }
    } catch {
      // non-JSON frame, ignore
    }
  }, [playAudio, options]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    createSession(userId, appName)
      .then((session) => {
        if (cancelled) return;
        sessionRef.current = session;

        const ws = new WebSocket(
          `${WS_BASE_URL}/ws/${session.userId}/${session.sessionId}`
        );
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onmessage = handleWsMessage;
        ws.onerror = () => { if (!cancelled) setError('WebSocket error'); };
        ws.onclose = () => { if (!cancelled) wsRef.current = null; };

        ws.onopen = () => {
          if (initialMessage) sendText(initialMessage, { hideUserBubble: true });
          startMic();
        };
      })
      .catch((e) => { if (!cancelled) setError(String(e)); });

    return () => {
      cancelled = true;
      stopMic();
      wsRef.current?.close();
      wsRef.current = null;
      playCtxRef.current?.close();
      playCtxRef.current = null;
      analyserRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, appName, enabled]);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const ctx = new AudioContext();
      micCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      micSourceRef.current = source;

      const nativeRate = ctx.sampleRate;
      const ratio = nativeRate / MIC_SAMPLE_RATE;
      const inputBufferSize = 4096;

      const processor = ctx.createScriptProcessor(inputBufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || mutedRef.current) return;

        const input = e.inputBuffer.getChannelData(0);
        const outLength = Math.round(input.length / ratio);
        const int16 = new Int16Array(outLength);

        for (let i = 0; i < outLength; i++) {
          const srcIdx = i * ratio;
          const lo = Math.floor(srcIdx);
          const hi = Math.min(lo + 1, input.length - 1);
          const frac = srcIdx - lo;
          const sample = input[lo] + frac * (input[hi] - input[lo]);
          int16[i] = Math.max(-32768, Math.min(32767, sample * 32768));
        }

        ws.send(int16.buffer);
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      setMicActive(true);
    } catch (e) {
      setError(`Microphone error: ${e}`);
    }
  }, []);

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    micSourceRef.current?.disconnect();
    micCtxRef.current?.close();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    processorRef.current = null;
    micSourceRef.current = null;
    micCtxRef.current = null;
    micStreamRef.current = null;
    setMicActive(false);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
  }, []);

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

  const clearMessages = () => setMessages([]);

  return {
    messages, streaming, error,
    sendText, sendVoiceMessage, sendImageMessage, clearMessages,
    micActive, startMic, stopMic,
    muted, toggleMute,
    analyserRef,
  };
}
