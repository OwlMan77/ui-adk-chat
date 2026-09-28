/**
 * The idle system: blinking, micro-saccades, breathing and head drift.
 *
 * This is the part everyone skips and the part that decides whether the thing
 * feels alive. A face that is perfectly still between utterances reads as
 * broken, not as calm. Clippy had no audio reactivity at all and still felt
 * more present than a pulsing circle, entirely because of idle behaviour.
 */

import type { FaceMode } from './types';

export interface IdleOutput {
  eyeOpen: number;
  lookX: number;
  lookY: number;
  breathe: number;
  headTilt: number;
}

export interface IdleSystem {
  update(nowMs: number, dt: number, mode: FaceMode, motionScale: number): IdleOutput;
  /** Fire a blink now -- used to mask expression changes, which is the cheapest
   *  way to make a pose transition look deliberate rather than glitchy. */
  triggerBlink(nowMs: number): void;
  reset(): void;
}

/** Blink closure, ms. Real blinks close faster than they open. */
const BLINK_CLOSE_MS = 55;
const BLINK_OPEN_MS = 95;

/** Cheap smooth noise: two incommensurate sines, so it never visibly loops. */
function drift(t: number, a: number, b: number): number {
  return Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.7) * 0.4;
}

function nextBlinkDelay(mode: FaceMode): number {
  // Humans blink ~15-20/min at rest, less when attending closely, more when
  // thinking. Randomised, not periodic -- a metronome blink is uncanny.
  const base =
    mode === 'listening' ? 4200 :
    mode === 'speaking' ? 2600 :
    mode === 'music' ? 2200 :
    3000;
  return base * (0.55 + Math.random() * 1.1);
}

export function createIdleSystem(): IdleSystem {
  let blinkStart = -1e9;
  let blinkDouble = false;
  let nextBlinkAt = 0;
  let seeded = false;

  // Saccades: small, fast eye movements to a new fixation point.
  let gazeX = 0, gazeY = 0;
  let gazeTargetX = 0, gazeTargetY = 0;
  let nextSaccadeAt = 0;

  function triggerBlink(nowMs: number) {
    if (nowMs - blinkStart < BLINK_CLOSE_MS + BLINK_OPEN_MS) return;
    blinkStart = nowMs;
    blinkDouble = Math.random() < 0.12;
  }

  function update(nowMs: number, dt: number, mode: FaceMode, motionScale: number): IdleOutput {
    if (!seeded) {
      nextBlinkAt = nowMs + nextBlinkDelay(mode);
      nextSaccadeAt = nowMs + 700 + Math.random() * 1800;
      seeded = true;
    }

    // --- blink -------------------------------------------------------------
    if (nowMs >= nextBlinkAt) {
      triggerBlink(nowMs);
      nextBlinkAt = nowMs + nextBlinkDelay(mode);
    }

    const cycle = BLINK_CLOSE_MS + BLINK_OPEN_MS;
    const span = blinkDouble ? cycle * 2 : cycle;
    const since = nowMs - blinkStart;
    let eyeOpen = 1;
    if (since >= 0 && since < span) {
      const phase = since % cycle;
      eyeOpen = phase < BLINK_CLOSE_MS
        ? 1 - phase / BLINK_CLOSE_MS
        : (phase - BLINK_CLOSE_MS) / BLINK_OPEN_MS;
      eyeOpen = Math.max(0.03, Math.min(1, eyeOpen));
    }

    // Blinks survive reduced motion: they carry liveness, not translation, and
    // an unblinking stare is worse for everyone.
    if (motionScale <= 0) {
      return { eyeOpen, lookX: 0, lookY: 0, breathe: 0, headTilt: 0 };
    }

    // --- saccades ----------------------------------------------------------
    if (nowMs >= nextSaccadeAt) {
      gazeTargetX = (Math.random() * 2 - 1) * 0.5;
      gazeTargetY = (Math.random() * 2 - 1) * 0.3;
      // Listening looks toward the viewer more often; music looks around more.
      if (mode === 'listening' && Math.random() < 0.55) {
        gazeTargetX *= 0.25;
        gazeTargetY *= 0.25;
      }
      nextSaccadeAt = nowMs + (mode === 'music' ? 500 : 900) + Math.random() * 2200;
    }
    // Saccades are ballistic: snap most of the way, then settle.
    const snap = Math.min(1, dt * 14);
    gazeX += (gazeTargetX - gazeX) * snap;
    gazeY += (gazeTargetY - gazeY) * snap;

    // --- breathing and drift ------------------------------------------------
    const t = nowMs / 1000;
    const breathe = (Math.sin(t * 1.55) * 0.5 + 0.5) * motionScale;
    const headTilt = drift(t, 0.31, 0.53) * 0.45 * motionScale;

    return {
      eyeOpen,
      lookX: gazeX * motionScale + drift(t, 0.13, 0.29) * 0.08 * motionScale,
      lookY: gazeY * motionScale + drift(t, 0.17, 0.41) * 0.06 * motionScale,
      breathe,
      headTilt,
    };
  }

  return {
    update,
    triggerBlink,
    reset() {
      blinkStart = -1e9;
      nextBlinkAt = 0;
      seeded = false;
      gazeX = gazeY = gazeTargetX = gazeTargetY = 0;
    },
  };
}
