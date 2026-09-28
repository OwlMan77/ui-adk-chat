/**
 * Word timings -- timing, never shape.
 *
 * They are word-level, so they cannot tell you what the mouth is doing; that
 * still comes from the spectrum in mouth.ts. What they can tell you is when a
 * word *begins*, and that buys the one thing audio analysis structurally cannot
 * have: anticipation. Analysis is always late -- it reports a sound after the
 * sound. A real mouth starts moving before the sound comes out, and 40-60 ms of
 * pre-opening is most of the difference between a face that is speaking and a
 * face that is reacting to speech.
 *
 * Everything here is in audio-clock milliseconds, not wall-clock: the timings
 * describe where a word sits in the playback stream, which is minutes away from
 * when the frame carrying them arrived.
 */

import { clamp01 } from './audioFeatures';

export interface WordTiming {
  word: string;
  /** Absolute position in the playback stream, ms. */
  startMs: number;
  endMs: number;
}

export interface WordCue {
  /** 0..1, rising into a word onset. Blended as a floor under the jaw. */
  anticipation: number;
  /** 0..1 impulse at an onset, decaying. Drives a small stress nod. */
  accent: number;
  /** A word is expected to be sounding right now. */
  voicing: boolean;
  /** True while there are timings to work from at all. */
  active: boolean;
}

export interface WordLane {
  /** Add timings already converted to absolute playback positions. */
  schedule(words: readonly WordTiming[]): void;
  update(audioMs: number): WordCue;
  /** Barge-in: the words that were queued are never going to be heard. */
  clear(): void;
}

/** How far ahead of an onset the mouth starts moving. */
const LEAD_MS = 45;

/** An accent decays over roughly this long. */
const ACCENT_MS = 180;

/** Timings older than this are dropped; they can never become due again. */
const STALE_MS = 2000;

const SILENT: WordCue = { anticipation: 0, accent: 0, voicing: false, active: false };

/**
 * A crude stress proxy. Long words and words ending a clause carry more weight
 * than articles. Real stress needs a prosody model; this is enough to stop
 * every word landing with identical force, which is what reads as robotic.
 */
function weight(word: string): number {
  const bare = word.replace(/[^\p{L}\p{N}']/gu, '');
  if (!bare) return 0;
  if (bare.length <= 2) return 0.25;
  if (bare.length <= 4) return 0.55;
  return 0.85;
}

export function createWordLane(): WordLane {
  let queue: Array<WordTiming & { w: number }> = [];
  let lastOnsetAt = -Infinity;
  let lastOnsetWeight = 0;

  return {
    schedule(words) {
      if (!words.length) return;
      for (const word of words) {
        if (!(word.endMs > word.startMs)) continue;
        queue.push({ ...word, w: weight(word.word) });
      }
      // The aligner emits in order, but sentences can arrive out of order if a
      // later one finishes generating first.
      queue.sort((a, b) => a.startMs - b.startMs);
    },

    update(audioMs) {
      if (!queue.length) return SILENT;

      if (queue[queue.length - 1].endMs < audioMs - STALE_MS) {
        queue = [];
        return SILENT;
      }

      let anticipation = 0;
      let voicing = false;
      let dropTo = 0;

      for (let i = 0; i < queue.length; i++) {
        const word = queue[i];

        if (word.endMs < audioMs - STALE_MS) {
          dropTo = i + 1;
          continue;
        }

        if (audioMs >= word.startMs && audioMs < word.endMs) {
          voicing = true;
          if (word.startMs > lastOnsetAt) {
            lastOnsetAt = word.startMs;
            lastOnsetWeight = word.w;
          }
          continue;
        }

        const until = word.startMs - audioMs;
        if (until > 0 && until <= LEAD_MS) {
          // Ramp in over the lead window, scaled by how stressed the word is.
          anticipation = Math.max(anticipation, (1 - until / LEAD_MS) * word.w);
        }
      }

      if (dropTo) queue = queue.slice(dropTo);

      const sinceOnset = audioMs - lastOnsetAt;
      const accent =
        sinceOnset >= 0 && sinceOnset < ACCENT_MS
          ? (1 - sinceOnset / ACCENT_MS) * lastOnsetWeight
          : 0;

      return {
        anticipation: clamp01(anticipation),
        accent: clamp01(accent),
        voicing,
        active: true,
      };
    },

    clear() {
      queue = [];
      lastOnsetAt = -Infinity;
      lastOnsetWeight = 0;
    },
  };
}
