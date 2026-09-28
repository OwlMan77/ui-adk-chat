import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createSession } from '../services/adkClient';
import type { ADKSession, ChatMessage, TextMessage, VoiceMessage, ImageMessage } from '../types';
import { createCueBus, extractTags, stripTags } from '../face/cueBus';
import { FACE_FFT_SIZE, FACE_SMOOTHING } from '../face/audioFeatures';
import type { Mood } from '../face/cues';

const ADK_BASE_URL = import.meta.env.VITE_ADK_BASE_URL ?? 'http://localhost:8000';
const WS_BASE_URL = ADK_BASE_URL.replace(/^http/, 'ws');

const REC_SAMPLE_RATE = 16000;
const PLAY_SAMPLE_RATE = 24000; // CSM/OmniVoice output rate

/** The cue block the server sends alongside each audio frame. */
interface ServerCue {
  chunkId?: number;
  mood?: string;
  tags?: string[];
  text?: string;
  sampleRate?: number;
  first?: boolean;
  final?: boolean;
  words?: Array<{ word: string; startMs: number; endMs: number }>;
}

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
  // Second analyser, on the mic, so the face can visibly listen while you talk.
  const micAnalyserRef = useRef<AnalyserNode | null>(null);

  // Cue channel: [tag] spans and mood labels travelling to the face.
  const cueBus = useMemo(() => createCueBus(), []);

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
  const rateWarnedRef = useRef(false);

  // Audio clock. The player is a ring buffer, so a chunk arrives long before it
  // is heard; scheduling cues on wall-clock time fires them a sentence early.
  const enqueuedFramesRef = useRef(0);
  const playedFramesRef = useRef(0);
  const playedAtRef = useRef(0);
  // Tags seen in the text stream but not yet attached to an audio chunk. The
  // server synthesises sentence by sentence, so the next chunk to arrive is
  // the one these belong to.
  const pendingTagsRef = useRef<string[]>([]);
  // Where each sentence begins in the playback stream, by chunk id. Word
  // timings arrive after the audio they describe and are relative to this.
  const sentenceStartRef = useRef<Map<number, number>>(new Map());

  /** Playback position in ms, interpolated between worklet reports. */
  const audioClockMs = useCallback(() => {
    const base = (playedFramesRef.current / PLAY_SAMPLE_RATE) * 1000;
    const since = playedAtRef.current ? performance.now() - playedAtRef.current : 0;
    const enqueued = (enqueuedFramesRef.current / PLAY_SAMPLE_RATE) * 1000;
    return Math.min(enqueued, base + Math.max(0, Math.min(200, since)));
  }, []);
  const agentIdRef = useRef(uid());

  // ── Mic ──────────────────────────────────────────────────────────────────

  const stopMic = useCallback(() => {
    recorderNodeRef.current?.disconnect();
    micSourceRef.current?.disconnect();
    micAnalyserRef.current?.disconnect();
    micCtxRef.current?.close();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    recorderNodeRef.current = null;
    micSourceRef.current = null;
    micAnalyserRef.current = null;
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

      // Listening lane. Same settings as the playback analyser: 1024 is ~21 ms
      // at 48 kHz, and the default 0.8 smoothing is far too smeared for a face.
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = FACE_FFT_SIZE;
      micAnalyser.smoothingTimeConstant = FACE_SMOOTHING;
      source.connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;

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

      // The cue block rides alongside the audio rather than inside it, so a
      // client that only understands audio ignores it without noticing.
      const cue = msg.cue as ServerCue | undefined;

      // TTS audio — inlineData with audio/pcm
      for (const part of parts) {
        const inline = part.inlineData as { mimeType?: string; data?: string } | undefined;
        if (inline?.mimeType?.startsWith('audio/pcm') && inline.data) {
          // The server announces its rate. We used to ignore it and hardcode
          // 24 kHz, which is silent breakage: the wrong rate does not error,
          // it just plays everything at the wrong pitch.
          const declared = cue?.sampleRate || Number(/rate=(\d+)/.exec(inline.mimeType)?.[1]);
          if (declared && declared !== PLAY_SAMPLE_RATE && !rateWarnedRef.current) {
            rateWarnedRef.current = true;
            console.warn(
              `[live] server sends ${declared} Hz but playback context is ${PLAY_SAMPLE_RATE} Hz — audio will be pitched.`,
            );
          }
          const buf = base64ToArrayBuffer(inline.data);
          // This chunk will start playing once everything already queued has
          // been heard. Cues from the sentence that produced it land there.
          const chunkStartMs = (enqueuedFramesRef.current / PLAY_SAMPLE_RATE) * 1000;
          enqueuedFramesRef.current += buf.byteLength / 2;

          // Where this sentence starts in the playback stream. The aligner runs
          // on the finished sentence, so its timings arrive in a later frame —
          // they are relative to this position, not to when they showed up.
          if (cue?.first && typeof cue.chunkId === 'number') {
            sentenceStartRef.current.set(cue.chunkId, chunkStartMs);
          }

          const tags = cue?.tags?.length ? cue.tags : pendingTagsRef.current;
          for (const tag of tags) cueBus.emit({ tag, atMs: chunkStartMs });
          pendingTagsRef.current = [];

          playerNodeRef.current?.port.postMessage(buf);
        }
      }

      if (cue) {
        if (cue.mood) cueBus.emitMood(cue.mood as Mood);

        if (cue.words?.length && typeof cue.chunkId === 'number') {
          // Sentence-relative -> absolute playback position.
          const base = sentenceStartRef.current.get(cue.chunkId) ?? 0;
          cueBus.emitWords(cue.words.map((w) => ({
            word: w.word,
            startMs: base + w.startMs,
            endMs: base + w.endMs,
          })));
        }

        // A sentence that was nothing but cues — "[laughter]" on its own. It
        // has no audio to hang off, so it lands now.
        if (!parts.length && cue.tags?.length) {
          for (const tag of cue.tags) cueBus.emit({ tag });
        }

        if (cue.final && typeof cue.chunkId === 'number') {
          sentenceStartRef.current.delete(cue.chunkId);
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
            // Fallback cue source, for a server that does not send the cue
            // block: the agent emits [laughter], [sigh], [question-*] inline.
            // Either way they are stripped from what the user reads — they are
            // instructions to the voice, not words.
            if (!cue) {
              pendingTagsRef.current.push(...extractTags(part.text as string));
            }
            agentTextRef.current += stripTags(part.text as string);
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
  }, [options, cueBus]);

  // ── Session lifecycle ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function setup() {
      // Init playback AudioWorklet ring buffer
      const ctx = new AudioContext({ sampleRate: PLAY_SAMPLE_RATE });
      await ctx.audioWorklet.addModule('/pcm-player-processor.js');
      const playerNode = new AudioWorkletNode(ctx, 'pcm-player-processor');
      playerNode.port.onmessage = (e: MessageEvent<{ type?: string; framesPlayed?: number }>) => {
        if (e.data?.type === 'progress' && typeof e.data.framesPlayed === 'number') {
          playedFramesRef.current = e.data.framesPlayed;
          playedAtRef.current = performance.now();
        }
      };
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FACE_FFT_SIZE;
      analyser.smoothingTimeConstant = FACE_SMOOTHING;
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
    micAnalyserRef,
    cueBus,
    audioClockMs,
  };
}
