/**
 * Audio features -> mouth shape.
 *
 * Two rules do most of the work here:
 *
 * 1. JALI split. The jaw (open) comes from amplitude; the lip shape
 *    (wide/round/teeth) comes from the spectrum. Driving everything from
 *    amplitude is exactly the sock-puppet failure mode -- the mouth bobs in
 *    time with the voice but bears no relationship to the words.
 *
 * 2. Minimum hold. A shape is kept for at least MIN_HOLD_MS even if the
 *    classifier changes its mind, or fast speech strobes between shapes at
 *    frame rate and reads as noise.
 */

import type { AudioFeatures } from './audioFeatures';
import { clamp01 } from './audioFeatures';
import type { MouthParams } from './types';
import type { VisemeKey } from './visemes';
import { VISEMES } from './visemes';

/** A shape shorter than this reads as a strobe rather than a mouth. */
export const MIN_HOLD_MS = 80;

/** How long after voicing stops we still treat a gap as a lip closure. */
const CLOSURE_WINDOW_MS = 130;

export interface MouthEstimator {
  update(f: AudioFeatures, nowMs: number): MouthParams;
  /** Last classified shape, for debugging and the verification pass. */
  shape(): VisemeKey;
  reset(): void;
}

export function createMouthEstimator(): MouthEstimator {
  let current: VisemeKey = 'X';
  let pending: VisemeKey = 'X';
  let heldSince = 0;
  let lastVoicedAt = -1e9;

  function classify(f: AudioFeatures, nowMs: number): VisemeKey {
    if (f.voiced) lastVoicedAt = nowMs;

    if (!f.active) {
      // A gap right after voicing is a consonant closure, not silence. Closing
      // the lips here instead of drooping to rest is a cheap, large win: it is
      // what makes speech look articulated between words.
      return nowMs - lastVoicedAt < CLOSURE_WINDOW_MS ? 'MBP' : 'X';
    }

    // Unvoiced and bright: fricative family. High ZCR with energy concentrated
    // up top is s/sh/ch; a softer version with less high energy is f/v.
    if (!f.voiced && f.zcr > 0.20) {
      return f.high > 0.14 ? 'SCH' : 'FV';
    }

    // Voiced: pick the vowel family by brightness. Centroid separates the
    // spread vowels (bright) from the rounded ones (dark) reliably enough for
    // a cartoon, which is all we are claiming.
    if (f.centroid > 0.58) return 'E';
    if (f.centroid > 0.36) return 'AI';
    if (f.centroid > 0.20) return 'O';
    return 'WQ';
  }

  function update(f: AudioFeatures, nowMs: number): MouthParams {
    const want = classify(f, nowMs);

    if (want !== current) {
      if (want !== pending) {
        pending = want;
      }
      if (nowMs - heldSince >= MIN_HOLD_MS) {
        current = want;
        heldSince = nowMs;
      }
    } else {
      pending = want;
    }

    const shape = VISEMES[current];

    // The jaw is amplitude, scaled by how open this shape wants to be. The rest
    // of the shape comes from the spectrum-derived classification.
    const jaw = clamp01(f.level * shape.open * 1.15);

    // Bright, spread vowels widen a little further when loud; rounded vowels
    // round harder. A small touch, but it keeps loud speech from looking like
    // one repeated shape.
    const emphasis = clamp01(f.level * 0.35);

    return {
      open: Math.max(jaw, shape.open * 0.18),
      wide: clamp01(shape.wide + emphasis * (shape.wide > 0.5 ? 0.15 : -0.05)),
      round: clamp01(shape.round + emphasis * (shape.round > 0.5 ? 0.12 : 0)),
      teeth: shape.teeth,
      lipClose: shape.lipClose,
    };
  }

  return {
    update,
    shape: () => current,
    reset() {
      current = 'X';
      pending = 'X';
      heldSince = 0;
      lastVoicedAt = -1e9;
    },
  };
}
