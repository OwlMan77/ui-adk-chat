/**
 * The driver: one requestAnimationFrame loop, three writers, one state object.
 *
 * No animation library in the hot path. Tweening libraries own a timeline,
 * which is the wrong shape for continuous audio input -- we want a loop that
 * reads the current audio state every frame, not twelve competing tweens.
 *
 * Everything schedules against an injectable clock. Today that is
 * performance.now(); once the player worklet reports framesPlayed it becomes
 * the audio clock, and nothing else in here changes. It is never setTimeout,
 * which drifts audibly within seconds.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { createFeatureReader, emptyFeatures } from './audioFeatures';
import type { AudioFeatures } from './audioFeatures';
import { createMouthEstimator } from './mouth';
import { createIdleSystem } from './idle';
import { createExpressionLane } from './cues';
import type { ExpressionPose, Mood } from './cues';
import type { FaceMode, FaceState, Skin } from './types';
import { CHANNEL_RATES, FACE_CHANNELS, restingFace } from './types';
import type { MusicDriver } from './music';
import { createWordLane } from './words';
import type { WordTiming } from './words';

export interface FaceDriverOptions {
  /** Analyser tapped off the agent's TTS playback. */
  speakingAnalyser: RefObject<AnalyserNode | null>;
  /** Analyser tapped off the mic, for the listening lane. */
  micAnalyser?: RefObject<AnalyserNode | null>;
  /** Skin to render into. */
  skin: RefObject<Skin | null>;
  /** Agent is currently generating a reply. */
  streaming?: boolean;
  /** Mic is muted -- suppresses the listening lane. */
  muted?: boolean;
  /** Backend is warming up (cold start); shows a waking pose. */
  waking?: boolean;
  /** 0 = no motion, 1 = full. Driven by prefers-reduced-motion. */
  motionScale?: number;
  /** Stop the loop entirely (tab hidden, face off-screen). */
  paused?: boolean;
  /** Music source, when the user has dropped a file or connected a stream. */
  music?: RefObject<MusicDriver | null>;
  /** Clock used to schedule cues. Defaults to performance.now(). */
  clockMs?: () => number;
}

export interface FaceControls {
  pushCue(tag: string, atMs?: number): void;
  setMood(mood: Mood): void;
  /** Word timings in absolute playback positions. Timing only -- never shape. */
  scheduleWords(words: readonly WordTiming[]): void;
  /** Drop queued timings; the audio they describe will not be heard. */
  clearWords(): void;
  /** Current state, for diagnostics. Mutated in place -- do not store. */
  state: RefObject<FaceState>;
  /** Last classified mouth shape, for the verification pass. */
  debug(): { shape: string; mode: FaceMode; features: AudioFeatures };
}

/** Exponential approach, framerate independent. tau is seconds-to-most-of-the-way. */
function approach(current: number, target: number, tau: number, dt: number): number {
  if (tau <= 0) return target;
  const k = 1 - Math.exp(-dt / tau);
  return current + (target - current) * k;
}

export function useFaceDriver(opts: FaceDriverOptions): FaceControls {
  const state = useRef<FaceState>(restingFace());
  const target = useRef<FaceState>(restingFace());
  const lastFeatures = useRef<AudioFeatures>(emptyFeatures());
  const modeRef = useRef<FaceMode>('idle');

  const mouth = useMemo(() => createMouthEstimator(), []);
  // Cues arrive stamped with the playback position their sentence starts at.
  // They wait here until the audio clock reaches them, then enter the lane on
  // wall-clock time -- the audio clock stops between utterances, and an
  // envelope evaluated against a stopped clock freezes mid-expression.
  const scheduled = useRef<Array<{ tag: string; atAudioMs: number }>>([]);
  const idle = useMemo(() => createIdleSystem(), []);
  const lane = useMemo(() => createExpressionLane(), []);
  const words = useMemo(() => createWordLane(), []);

  // Options are read through a ref so the loop is never torn down mid-session
  // by an unrelated prop change.
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });

  useEffect(() => {
    // Readers are created here rather than memoised: they read their analyser
    // through optsRef every frame, so they never need rebuilding when a ref
    // identity changes.
    const speakReader = createFeatureReader(() => optsRef.current.speakingAnalyser.current);
    const micReader = createFeatureReader(() => optsRef.current.micAnalyser?.current ?? null);

    let raf = 0;
    let last = performance.now();

    function frame(now: number) {
      raf = requestAnimationFrame(frame);

      const o = optsRef.current;
      const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (o.paused) return;

      const clock = o.clockMs ? o.clockMs() : now;
      const motion = o.motionScale ?? 1;

      const music = o.music?.current ?? null;
      const speech = speakReader.read();
      const mic = !o.muted ? micReader.read() : emptyFeatures();
      lastFeatures.current = speech;

      // --- mode -------------------------------------------------------------
      const mode: FaceMode =
        o.waking ? 'waking' :
        music && music.isPlaying() ? 'music' :
        speech.active ? 'speaking' :
        mic.active ? 'listening' :
        o.streaming ? 'speaking' :
        'idle';
      modeRef.current = mode;

      const t = target.current;

      // --- mouth lane (fast) -------------------------------------------------
      if (mode === 'speaking' || (mode === 'waking' && speech.active)) {
        // Wall clock, not the audio clock: the analyser reports what is being
        // heard right now, so hold times and closure windows are present-time.
        const m = mouth.update(speech, now);
        t.open = m.open;
        t.wide = m.wide;
        t.round = m.round;
        t.teeth = m.teeth;
        t.lipClose = m.lipClose;
      } else {
        // Never lip-sync to music or to the user's voice. A mouth mouthing
        // along to a drum loop is absurd, and mirroring the user is worse.
        const rest = mouth.update(emptyFeatures(), now);
        t.open = rest.open;
        t.wide = rest.wide;
        t.round = rest.round;
        t.teeth = rest.teeth;
        t.lipClose = rest.lipClose;
      }

      // --- cues due by the audio clock ---------------------------------------
      if (scheduled.current.length) {
        const due = scheduled.current.filter((c) => clock >= c.atAudioMs);
        if (due.length) {
          scheduled.current = scheduled.current.filter((c) => clock < c.atAudioMs);
          for (const c of due) lane.pushCue(c.tag, now);
        }
      }

      // --- expression lane (slow) --------------------------------------------
      const pose: ExpressionPose = lane.update(now);
      if (lane.consumeBlinkRequest()) idle.triggerBlink(now);

      t.smile = pose.smile;
      t.browRaise = pose.browRaise;
      t.browAngle = pose.browAngle;
      t.headBob = pose.headBob;
      t.energy = pose.energy;

      // --- idle system --------------------------------------------------------
      const id = idle.update(now, dt, mode, motion);
      t.eyeOpen = id.eyeOpen * pose.eyeScale;
      t.lookX = id.lookX;
      t.lookY = id.lookY;
      t.breathe = id.breathe;
      t.headTilt = pose.headTilt * 0.7 + id.headTilt;

      // --- per-mode modulation -------------------------------------------------
      if (mode === 'listening') {
        // Attentive: brows a touch up, gaze pulled toward the viewer, and a
        // small tilt that tracks how loudly the user is speaking.
        t.browRaise = Math.max(t.browRaise, 0.18 + mic.level * 0.35);
        t.lookX *= 0.4;
        t.lookY *= 0.4;
        t.energy = Math.max(t.energy, 0.3 + mic.level * 0.4);
      } else if (mode === 'music' && music) {
        const g = music.groove(clock);
        t.headBob = Math.max(t.headBob, g.bob * motion);
        t.headTilt += g.sway * 0.6 * motion;
        t.energy = Math.max(t.energy, g.energy);
        t.browRaise = Math.max(t.browRaise, g.accent * 0.5);
        t.smile = Math.max(t.smile, 0.25 + g.energy * 0.3);
        if (g.blink) idle.triggerBlink(now);
      } else if (mode === 'waking') {
        // Honest about a cold start: heavy lids, slow, not a frozen pose.
        t.eyeOpen = Math.min(t.eyeOpen, 0.35);
        t.energy = 0.1;
        t.browRaise = Math.min(t.browRaise, 0.05);
      } else if (mode === 'speaking') {
        // Prosody as texture: loud, bright speech gets livelier brows. This is
        // what stops every sentence from looking identical.
        t.browRaise = Math.max(t.browRaise, speech.level * speech.centroid * 0.45);
        t.energy = Math.max(t.energy, 0.4 + speech.level * 0.5);

        // Word timings, when the engine supplies them. A floor under the jaw
        // rather than a replacement for it: the shape still comes from the
        // spectrum, this only gets the mouth moving before the sound does.
        const w = words.update(clock);
        if (w.active) {
          t.open = Math.max(t.open, w.anticipation * 0.35 * motion);
          t.headBob = Math.max(t.headBob, w.accent * 0.28 * motion);
        }
      }

      // Reduced motion keeps the mouth -- it carries information and is small
      // amplitude -- but at about 40% travel, alongside the idle motion that
      // has already been zeroed above.
      if (motion <= 0) {
        t.open *= 0.4;
        t.headBob *= 0.3;
      }

      // --- smoothing ------------------------------------------------------------
      const s = state.current;
      for (const ch of FACE_CHANNELS) {
        const rate = CHANNEL_RATES[ch];
        const tv = t[ch];
        const cv = s[ch];
        // Asymmetric: mouths open faster than they close. This one line is the
        // difference between speech and a throbbing hole.
        const tau = Math.abs(tv) > Math.abs(cv) ? rate.attack : rate.release;
        s[ch] = approach(cv, tv, tau, dt);
      }

      o.skin.current?.apply(s, mode);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mouth, idle, lane, words]);

  return useMemo<FaceControls>(() => ({
    pushCue(tag, atMs) {
      if (atMs === undefined || !optsRef.current.clockMs) {
        lane.pushCue(tag, performance.now());
        return;
      }
      scheduled.current.push({ tag, atAudioMs: atMs });
    },
    setMood(mood) { lane.setMood(mood); },
    scheduleWords(w) { words.schedule(w); },
    clearWords() { words.clear(); },
    state,
    debug: () => ({
      shape: mouth.shape(),
      mode: modeRef.current,
      features: lastFeatures.current,
    }),
  }), [lane, mouth, words]);
}
