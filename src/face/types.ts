/**
 * FaceState is the single interface every part of the face talks through.
 *
 * Three writers on three different clocks all write these same numbers:
 *   - the mouth lane, per frame, from audio features (+ word timings when available)
 *   - the expression lane, ~1 Hz, from cue tags and mood
 *   - the idle system, on its own scheduler (blink, saccades, breathing, drift)
 *
 * Because they share one parameter set they blend instead of fighting, and a
 * renderer only ever has to read a plain object.
 */

/** Mouth shape as a point in a small continuous space, not a sprite index. */
export interface MouthParams {
  /** Jaw aperture. Driven by amplitude. */
  open: number;
  /** Corner spread. Wide for E/AI, narrow for O/U. */
  wide: number;
  /** Lip rounding/pucker. Driven by spectral darkness. */
  round: number;
  /** Teeth visibility, for F/V and sibilants. */
  teeth: number;
  /** Full lip closure, for M/B/P. Overrides open when high. */
  lipClose: number;
}

export interface FaceState extends MouthParams {
  /** -1 frown .. 1 smile */
  smile: number;
  /** 0 neutral .. 1 raised */
  browRaise: number;
  /** -1 angry/inward .. 1 sad/outward */
  browAngle: number;
  /** 0 closed .. 1 open. Blink drives this toward 0. */
  eyeOpen: number;
  /** -1 left .. 1 right */
  lookX: number;
  /** -1 down .. 1 up */
  lookY: number;
  /** -1 left .. 1 right */
  headTilt: number;
  /** 0 .. 1 vertical bob, used by music mode and speech stress */
  headBob: number;
  /** 0 .. 1 slow breathing scale */
  breathe: number;
  /** 0 .. 1 overall liveliness; scales idle and groove amplitudes */
  energy: number;
}

export type FaceChannel = keyof FaceState;

export const FACE_CHANNELS: FaceChannel[] = [
  'open', 'wide', 'round', 'teeth', 'lipClose',
  'smile', 'browRaise', 'browAngle', 'eyeOpen', 'lookX', 'lookY',
  'headTilt', 'headBob', 'breathe', 'energy',
];

/**
 * Rest pose. Note the mouth is *slightly* open at rest: snapping fully closed
 * between every word is one of the things that reads as mechanical. Only
 * lipClose closes it properly.
 */
export function restingFace(): FaceState {
  return {
    open: 0.04, wide: 0.3, round: 0, teeth: 0, lipClose: 0,
    smile: 0.12, browRaise: 0, browAngle: 0, eyeOpen: 1, lookX: 0, lookY: 0,
    headTilt: 0, headBob: 0, breathe: 0, energy: 0.2,
  };
}

/**
 * Per-channel smoothing, in seconds to converge most of the way.
 *
 * Attack and release are deliberately asymmetric: mouths open faster than they
 * close. Symmetric smoothing is the single most common reason audio-reactive
 * faces look like flapping puppets, so this table is load-bearing.
 */
export interface ChannelRate { attack: number; release: number }

export const CHANNEL_RATES: Record<FaceChannel, ChannelRate> = {
  open:      { attack: 0.030, release: 0.110 },
  wide:      { attack: 0.045, release: 0.120 },
  round:     { attack: 0.045, release: 0.120 },
  teeth:     { attack: 0.030, release: 0.090 },
  lipClose:  { attack: 0.025, release: 0.070 },
  smile:     { attack: 0.220, release: 0.400 },
  browRaise: { attack: 0.120, release: 0.320 },
  browAngle: { attack: 0.160, release: 0.360 },
  // Much faster than the rest: a blink is a 55 ms ramp, and at the mouth's
  // time constants the smoothing swallows it into a lazy squint.
  eyeOpen:   { attack: 0.012, release: 0.016 },
  lookX:     { attack: 0.090, release: 0.140 },
  lookY:     { attack: 0.090, release: 0.140 },
  headTilt:  { attack: 0.260, release: 0.420 },
  headBob:   { attack: 0.055, release: 0.180 },
  breathe:   { attack: 0.500, release: 0.500 },
  energy:    { attack: 0.400, release: 0.900 },
};

/** What the face is currently doing. Drives which lanes are active. */
export type FaceMode = 'idle' | 'listening' | 'speaking' | 'music' | 'waking';

/**
 * A skin is a renderer. This is the entire interface, which is what makes the
 * renderer swappable (hand-written SVG now, Rive later) without the audio code
 * ever knowing.
 */
export interface Skin {
  mount(host: HTMLElement): void;
  apply(state: FaceState, mode: FaceMode): void;
  unmount(): void;
}
