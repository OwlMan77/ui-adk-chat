/**
 * Tests for the parts of the face that are easy to get subtly wrong and
 * impossible to eyeball reliably.
 *
 * Run with: bun test
 */

import { test, expect } from 'bun:test';
import { createMouthEstimator, MIN_HOLD_MS } from '../src/face/mouth';
import { emptyFeatures } from '../src/face/audioFeatures';
import type { AudioFeatures } from '../src/face/audioFeatures';
import { CHANNEL_RATES } from '../src/face/types';
import { createExpressionLane } from '../src/face/cues';
import { extractMood, extractTags, stripTags } from '../src/face/cueBus';

function speech(overrides: Partial<AudioFeatures> = {}): AudioFeatures {
  return {
    ...emptyFeatures(),
    level: 0.6,
    rms: 0.1,
    low: 0.4,
    mid: 0.2,
    high: 0.05,
    centroid: 0.45,
    zcr: 0.1,
    active: true,
    voiced: true,
    ...overrides,
  };
}

test('jaw and lip shape move independently (the JALI split)', () => {
  // Hold loudness constant and sweep brightness: the lip shape must change
  // while the jaw stays put. If these track each other the face is an
  // amplitude meter with a mouth drawn on it.
  const m = createMouthEstimator();
  let t = 0;
  const opens: number[] = [];
  const shapes: number[] = [];

  for (const centroid of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    // Let each shape settle past the minimum hold.
    let out = m.update(speech({ centroid }), t);
    for (let i = 0; i < 12; i++) {
      t += 16;
      out = m.update(speech({ centroid }), t);
    }
    opens.push(out.open);
    shapes.push(out.wide - out.round);
  }

  const openSpread = Math.max(...opens) - Math.min(...opens);
  const shapeSpread = Math.max(...shapes) - Math.min(...shapes);

  expect(shapeSpread).toBeGreaterThan(0.5);
  // The jaw does vary a little because each viseme has its own openness, but
  // brightness must not be the thing driving it.
  expect(openSpread).toBeLessThan(shapeSpread);
});

test('loudness drives the jaw without redrawing the lips', () => {
  const m = createMouthEstimator();
  let t = 0;
  const settle = (f: AudioFeatures) => {
    let out = m.update(f, t);
    for (let i = 0; i < 12; i++) { t += 16; out = m.update(f, t); }
    return out;
  };

  const quiet = settle(speech({ level: 0.15, centroid: 0.45 }));
  const loud = settle(speech({ level: 1.0, centroid: 0.45 }));

  expect(loud.open).toBeGreaterThan(quiet.open * 1.5);
  expect(Math.abs(loud.round - quiet.round)).toBeLessThan(0.2);
});

test('a mouth shape is held for at least MIN_HOLD_MS', () => {
  const m = createMouthEstimator();
  let t = 0;
  let last = m.shape();
  let lastChange = 0;
  const gaps: number[] = [];

  // Alternate between two very different classifications every frame. Without
  // the hold this strobes at 60 Hz.
  for (let i = 0; i < 200; i++) {
    t += 16;
    const centroid = i % 2 === 0 ? 0.05 : 0.95;
    m.update(speech({ centroid }), t);
    if (m.shape() !== last) {
      if (lastChange > 0) gaps.push(t - lastChange);
      last = m.shape();
      lastChange = t;
    }
  }

  expect(gaps.length).toBeGreaterThan(0);
  for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(MIN_HOLD_MS);
});

test('silence after voicing closes the lips rather than drooping open', () => {
  const m = createMouthEstimator();
  let t = 0;
  for (let i = 0; i < 10; i++) { t += 16; m.update(speech(), t); }

  t += 16;
  m.update(emptyFeatures(), t);
  expect(m.shape()).toBe('MBP');

  // Long after speech stops it settles to true rest.
  t += 500;
  m.update(emptyFeatures(), t);
  expect(m.shape()).toBe('X');
});

test('every channel opens faster than it closes', () => {
  // Symmetric smoothing is the classic reason a mouth reads as a throbbing
  // hole rather than speech.
  for (const [name, rate] of Object.entries(CHANNEL_RATES)) {
    if (name === 'breathe') continue; // breathing is deliberately symmetric
    expect(rate.attack).toBeLessThanOrEqual(rate.release);
  }
  expect(CHANNEL_RATES.open.attack).toBeLessThan(CHANNEL_RATES.open.release);
});

test('cues rise, hold and decay back to the mood', () => {
  const lane = createExpressionLane();
  lane.setMood('neutral');
  const base = lane.update(0).smile;

  lane.pushCue('laughter', 1000);
  expect(lane.update(900).smile).toBeCloseTo(base, 3);

  const peak = lane.update(1000 + 140 + 200).smile;
  expect(peak).toBeGreaterThan(base + 0.5);
  expect(lane.consumeBlinkRequest()).toBe(true);
  expect(lane.consumeBlinkRequest()).toBe(false);

  const after = lane.update(1000 + 140 + 1400 + 500).smile;
  expect(after).toBeCloseTo(base, 3);
});

test('unknown tags are ignored rather than throwing', () => {
  const lane = createExpressionLane();
  lane.pushCue('not-a-real-tag', 0);
  expect(lane.update(100).smile).toBeCloseTo(0.12, 3);
});

test('tags are extracted for the face and stripped from the transcript', () => {
  const line = 'Well [laughter] that is certainly one way [question-en] to do it.';
  expect(extractTags(line)).toEqual(['laughter', 'question-en']);
  expect(stripTags(line)).toBe('Well that is certainly one way to do it.');
});

// ── the transcript, and what the agent actually emits ─────────────────────────
//
// Caught by driving the real backend over a WebSocket: the agent opens every
// reply with `[mood:neutral]`, and a client pattern that allowed only letters
// and hyphens matched `[laughter]` but not that. It survived stripping and would
// have appeared verbatim in the transcript -- the exact bug this prevents.

test('a declared mood never reaches the transcript', () => {
  const raw = '[mood:neutral] Hello! Did you know owls cannot move their eyeballs?';
  expect(stripTags(raw)).toBe('Hello! Did you know owls cannot move their eyeballs?');
});

test('mood is recovered from the text, not mistaken for a cue', () => {
  const raw = '[mood:urgent] Move. [laughter] Only joking.';
  expect(extractMood(raw)).toBe('urgent');
  expect(extractTags(raw)).toEqual(['laughter']);
});

test('an invented mood is ignored rather than passed through', () => {
  // The face has five poses. Anything else must not reach setMood.
  expect(extractMood('[mood:ecstatic] Wonderful.')).toBeUndefined();
});

test('a reply with no mood declared yields none', () => {
  expect(extractMood('Just a plain sentence.')).toBeUndefined();
});

test('bracketed prose and array indices still survive', () => {
  const raw = 'The value is at [0] and the next at [1].';
  expect(stripTags(raw)).toBe(raw);
  expect(extractTags(raw)).toEqual([]);
});

test('stripping a leading tag does not leave the line indented', () => {
  expect(stripTags('[sigh] Fine.')).toBe('Fine.');
  expect(stripTags('Really [question-en]?')).toBe('Really?');
});
