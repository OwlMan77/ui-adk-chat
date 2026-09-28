/**
 * Music mode: dropped-file playback with an offline beat grid.
 *
 * The rule that matters: the beat grid drives *timing*, amplitude only drives
 * *intensity*. Amplitude-following is structurally late by a frame or three,
 * which is why it always looks like the character is being shoved around by the
 * music rather than dancing to it. Because decodeAudioData hands us the whole
 * buffer we can analyse it up front and therefore know the future -- which is
 * what lets us start the wind-up *before* the beat so the hit lands on it.
 *
 * Tempo comes from web-audio-beat-detector (MIT, 42 KB), which returns both bpm
 * and offset, i.e. a real grid rather than just a tempo. Onsets are split-band
 * envelope flux computed here: kick, snare and hats want different reactions.
 */

import { guess } from 'web-audio-beat-detector';
import { clamp, clamp01 } from './audioFeatures';

/** Analysis rate for the onset envelopes. ~11.6 ms per hop at 11025 Hz. */
const ANALYSIS_RATE = 11025;
const HOP = 128;

/** Wind-up lead, seconds. The hit lands on the beat; the move starts before it. */
const ANTICIPATION_S = 0.13;

/** Below this we do not trust the grid and fall back to gentle swaying. */
const CONFIDENCE_FLOOR = 0.34;

export interface Groove {
  /** 0..1 vertical bob. */
  bob: number;
  /** -1..1 lateral sway. */
  sway: number;
  /** 0..1 overall energy, from the slow envelope. */
  energy: number;
  /** 0..1 transient accent, from snare-band onsets. */
  accent: number;
  /** True on the frame a downbeat blink should fire. */
  blink: boolean;
}

export interface MusicAnalysis {
  bpm: number;
  offset: number;
  confidence: number;
  durationS: number;
}

export interface MusicDriver {
  loadFile(file: File): Promise<MusicAnalysis>;
  play(): void;
  stop(): void;
  isPlaying(): boolean;
  analysis(): MusicAnalysis | null;
  groove(clockMs: number): Groove;
  dispose(): void;
}

interface Envelopes {
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  /** Slow overall loudness, same hop grid. */
  slow: Float32Array;
  hopS: number;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Render one band of the buffer offline and return its positive-flux envelope. */
async function bandEnvelope(
  buffer: AudioBuffer,
  filter: (ctx: OfflineAudioContext) => BiquadFilterNode,
): Promise<Float32Array> {
  const length = Math.ceil(buffer.duration * ANALYSIS_RATE);
  const ctx = new OfflineAudioContext(1, length, ANALYSIS_RATE);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const node = filter(ctx);
  src.connect(node);
  node.connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  const data = rendered.getChannelData(0);

  const hops = Math.floor(data.length / HOP);
  const rms = new Float32Array(hops);
  for (let h = 0; h < hops; h++) {
    let sum = 0;
    const base = h * HOP;
    for (let i = 0; i < HOP; i++) {
      const v = data[base + i];
      sum += v * v;
    }
    rms[h] = Math.sqrt(sum / HOP);
  }

  // Positive flux: only rises count as onsets.
  const flux = new Float32Array(hops);
  let peak = 1e-6;
  for (let h = 1; h < hops; h++) {
    const d = rms[h] - rms[h - 1];
    flux[h] = d > 0 ? d : 0;
    if (flux[h] > peak) peak = flux[h];
  }
  for (let h = 0; h < hops; h++) flux[h] /= peak;
  return flux;
}

async function slowEnvelope(buffer: AudioBuffer): Promise<Float32Array> {
  const length = Math.ceil(buffer.duration * ANALYSIS_RATE);
  const ctx = new OfflineAudioContext(1, length, ANALYSIS_RATE);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  const data = rendered.getChannelData(0);

  const hops = Math.floor(data.length / HOP);
  const out = new Float32Array(hops);
  let env = 0;
  let peak = 1e-6;
  for (let h = 0; h < hops; h++) {
    let sum = 0;
    const base = h * HOP;
    for (let i = 0; i < HOP; i++) {
      const v = data[base + i];
      sum += v * v;
    }
    const r = Math.sqrt(sum / HOP);
    // ~1.5 s time constant: this is the chorus/breakdown envelope, not a meter.
    env += (r - env) * 0.008;
    out[h] = env;
    if (env > peak) peak = env;
  }
  for (let h = 0; h < hops; h++) out[h] /= peak;
  return out;
}

/**
 * How much of the low-band onset energy actually lands near the predicted beat
 * positions, versus what you would expect by chance. A confidently wrong grid
 * looks far worse than gentle swaying, so this gate matters.
 */
function gridConfidence(low: Float32Array, hopS: number, bpm: number, offset: number): number {
  if (!isFinite(bpm) || bpm <= 0) return 0;
  const beatS = 60 / bpm;
  const windowS = Math.min(0.07, beatS * 0.18);
  let onBeat = 0;
  let total = 0;
  for (let h = 0; h < low.length; h++) {
    const v = low[h];
    if (v <= 0) continue;
    total += v;
    const t = h * hopS;
    const rel = (t - offset) / beatS;
    const dist = Math.abs(rel - Math.round(rel)) * beatS;
    if (dist <= windowS) onBeat += v;
  }
  if (total <= 0) return 0;
  const share = onBeat / total;
  const expected = (2 * windowS) / beatS;
  if (expected <= 0 || expected >= 1) return 0;
  // 1.0 means perfectly aligned, 0 means no better than chance.
  return clamp01((share - expected) / (1 - expected));
}

export function createMusicDriver(ctx: AudioContext): MusicDriver {
  let buffer: AudioBuffer | null = null;
  let env: Envelopes | null = null;
  let info: MusicAnalysis | null = null;

  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  let startedAtCtx = 0;
  let playing = false;
  let lastBeatIndex = -1;

  function sampleAt(arr: Float32Array, posS: number, hopS: number): number {
    const h = Math.floor(posS / hopS);
    if (h < 0 || h >= arr.length) return 0;
    return arr[h];
  }

  async function loadFile(file: File): Promise<MusicAnalysis> {
    stop();
    const bytes = await file.arrayBuffer();
    buffer = await ctx.decodeAudioData(bytes);

    const [low, mid, high, slow] = await Promise.all([
      bandEnvelope(buffer, (c) => {
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 200;
        return f;
      }),
      bandEnvelope(buffer, (c) => {
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900;
        f.Q.value = 0.8;
        return f;
      }),
      bandEnvelope(buffer, (c) => {
        const f = c.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 4000;
        return f;
      }),
      slowEnvelope(buffer),
    ]);

    const hopS = HOP / ANALYSIS_RATE;
    env = { low, mid, high, slow, hopS };

    let bpm = 0;
    let offset = 0;
    try {
      const g = await guess(buffer);
      bpm = g.bpm;
      offset = g.offset;
    } catch {
      // Ambient, rubato and spoken word legitimately have no tempo. That is a
      // result, not an error -- we just do not groove.
      bpm = 0;
    }

    // Fold into a sane range; half/double-tempo errors are the common failure.
    while (bpm > 180) bpm /= 2;
    while (bpm > 0 && bpm < 70) bpm *= 2;

    const confidence = bpm > 0 ? gridConfidence(low, hopS, bpm, offset) : 0;
    info = { bpm, offset, confidence, durationS: buffer.duration };
    return info;
  }

  function play() {
    if (!buffer) return;
    stop();
    source = ctx.createBufferSource();
    source.buffer = buffer;
    gain = ctx.createGain();
    gain.gain.value = 0.9;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.onended = () => { playing = false; };
    startedAtCtx = ctx.currentTime;
    lastBeatIndex = -1;
    source.start();
    playing = true;
  }

  function stop() {
    if (source) {
      try { source.onended = null; source.stop(); } catch { /* already stopped */ }
      source.disconnect();
      source = null;
    }
    if (gain) { gain.disconnect(); gain = null; }
    playing = false;
  }

  function groove(): Groove {
    const quiet: Groove = { bob: 0, sway: 0, energy: 0.2, accent: 0, blink: false };
    if (!playing || !env || !info || !buffer) return quiet;

    const posS = ctx.currentTime - startedAtCtx;
    if (posS < 0 || posS > buffer.duration) return quiet;

    const energy = clamp01(sampleAt(env.slow, posS, env.hopS));
    const accent = clamp01(sampleAt(env.mid, posS, env.hopS) * 1.6);
    const shimmer = clamp01(sampleAt(env.high, posS, env.hopS));

    // Low confidence: sway gently, do not pretend to know where the beat is.
    if (info.confidence < CONFIDENCE_FLOOR || info.bpm <= 0) {
      const t = posS;
      return {
        bob: energy * 0.12,
        sway: Math.sin(t * 0.9) * 0.3 * (0.4 + energy * 0.6),
        energy: 0.3 + energy * 0.4,
        accent: accent * 0.4,
        blink: false,
      };
    }

    const beatS = 60 / info.bpm;
    const beatsFloat = (posS - info.offset) / beatS;
    const beatIndex = Math.floor(beatsFloat);
    const phase = beatsFloat - beatIndex;

    // Downbeat hierarchy. Uniform per-beat motion is the second biggest
    // fakeness tell after amplitude-following.
    const inBar = ((beatIndex % 4) + 4) % 4;
    const weight = inBar === 0 ? 1 : inBar === 2 ? 0.65 : 0.45;

    // Phrase accent every 8 bars -- listeners feel phrases even unnamed.
    const bar = Math.floor(beatIndex / 4);
    const phrase = ((bar % 8) + 8) % 8 === 0 && inBar === 0 ? 1.25 : 1;

    // Anticipation: wind up before the beat, hit on it, then recover slowly.
    const leadPhase = clamp(ANTICIPATION_S / beatS, 0.02, 0.45);
    let shape: number;
    if (phase > 1 - leadPhase) {
      // Wind-up: move slightly the other way so the hit has somewhere to fall from.
      const t = (phase - (1 - leadPhase)) / leadPhase;
      shape = -0.35 * easeOutQuad(t);
    } else {
      const hitPhase = clamp(0.08 / beatS, 0.05, 0.4);
      if (phase < hitPhase) {
        shape = easeOutQuad(1 - phase / hitPhase);
      } else {
        const t = (phase - hitPhase) / (1 - leadPhase - hitPhase);
        // Slight overshoot on the recovery reads as follow-through.
        shape = -0.08 * Math.sin(Math.PI * clamp01(t));
      }
    }

    const gain2 = (0.35 + energy * 0.65) * weight * phrase;
    const blink = beatIndex !== lastBeatIndex && inBar === 0 && Math.random() < 0.35;
    if (beatIndex !== lastBeatIndex) lastBeatIndex = beatIndex;

    return {
      bob: clamp01(shape * gain2),
      sway: Math.sin(beatsFloat * Math.PI / 4) * 0.45 * (0.4 + energy * 0.6),
      energy: clamp01(0.35 + energy * 0.65),
      accent: clamp01(accent * 0.7 + shimmer * 0.3),
      blink,
    };
  }

  return {
    loadFile,
    play,
    stop,
    isPlaying: () => playing,
    analysis: () => info,
    groove,
    dispose() {
      stop();
      buffer = null;
      env = null;
      info = null;
    },
  };
}
