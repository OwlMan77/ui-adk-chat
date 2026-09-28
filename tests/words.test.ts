/**
 * Word timings drive timing, never shape.
 *
 * The one thing they buy that audio analysis structurally cannot have is
 * anticipation: a mouth that starts moving before the sound arrives. These
 * tests pin that, and pin that the lane stays silent when there is nothing to
 * work from -- the engine may not supply timings at all, and the face has to
 * look identical when it doesn't.
 */

import { describe, expect, test } from 'bun:test';
import { createWordLane } from '../src/face/words';

const HELLO = [
  { word: 'Hello', startMs: 1000, endMs: 1400 },
  { word: 'there', startMs: 1450, endMs: 1800 },
];

describe('word lane', () => {
  test('is inert with nothing scheduled', () => {
    const lane = createWordLane();
    const cue = lane.update(1000);
    expect(cue.active).toBe(false);
    expect(cue.anticipation).toBe(0);
    expect(cue.accent).toBe(0);
  });

  test('opens the mouth before the word, not after it', () => {
    const lane = createWordLane();
    lane.schedule(HELLO);

    // 100 ms out: too early to move.
    expect(lane.update(900).anticipation).toBe(0);

    // 20 ms out: well into the lead window.
    const justBefore = lane.update(980).anticipation;
    expect(justBefore).toBeGreaterThan(0);

    // Closer still means more open — this is the ramp, not a step.
    expect(lane.update(995).anticipation).toBeGreaterThan(justBefore);
  });

  test('reports voicing across a word and silence between words', () => {
    const lane = createWordLane();
    lane.schedule(HELLO);
    expect(lane.update(1200).voicing).toBe(true);
    expect(lane.update(1420).voicing).toBe(false);
    expect(lane.update(1600).voicing).toBe(true);
  });

  test('accents decay rather than latching on', () => {
    const lane = createWordLane();
    lane.schedule(HELLO);

    lane.update(1010);
    const atOnset = lane.update(1020).accent;
    expect(atOnset).toBeGreaterThan(0);

    const later = lane.update(1150).accent;
    expect(later).toBeLessThan(atOnset);
    expect(lane.update(1300).accent).toBe(0);
  });

  test('short words carry less stress than long ones', () => {
    const lane = createWordLane();
    lane.schedule([
      { word: 'a', startMs: 100, endMs: 160 },
      { word: 'catastrophe', startMs: 400, endMs: 1200 },
    ]);
    lane.update(110);
    const weak = lane.update(120).accent;
    lane.update(410);
    const strong = lane.update(420).accent;
    expect(strong).toBeGreaterThan(weak);
  });

  test('barge-in clears words that will never be heard', () => {
    const lane = createWordLane();
    lane.schedule(HELLO);
    expect(lane.update(1200).active).toBe(true);
    lane.clear();
    expect(lane.update(1200).active).toBe(false);
  });

  test('stale timings do not accumulate', () => {
    const lane = createWordLane();
    lane.schedule(HELLO);
    // Long past the end of the last word.
    expect(lane.update(9000).active).toBe(false);
  });

  test('out-of-order sentences are put back in order', () => {
    const lane = createWordLane();
    lane.schedule([{ word: 'second', startMs: 3000, endMs: 3400 }]);
    lane.schedule([{ word: 'first', startMs: 1000, endMs: 1400 }]);
    expect(lane.update(1100).voicing).toBe(true);
    expect(lane.update(3100).voicing).toBe(true);
  });

  test('zero-length timings are rejected rather than dividing by zero', () => {
    const lane = createWordLane();
    lane.schedule([{ word: 'broken', startMs: 500, endMs: 500 }]);
    expect(lane.update(500).active).toBe(false);
  });
});
