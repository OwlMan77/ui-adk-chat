/**
 * A tiny event bus for cues travelling from the WebSocket to the face.
 *
 * Deliberately not React state: cues are events, and rendering each one through
 * a re-render would drop the ones that arrive in the same tick and put the
 * animation on the React scheduler instead of the audio clock.
 */

import type { Mood } from './cues';
import type { WordTiming } from './words';

export interface CueEvent {
  tag: string;
  /** Clock time the cue should land, ms. Absent means "now". */
  atMs?: number;
}

export type CueListener = (event: CueEvent) => void;
export type MoodListener = (mood: Mood) => void;
export type WordListener = (words: readonly WordTiming[]) => void;

export interface CueBus {
  emit(event: CueEvent): void;
  emitMood(mood: Mood): void;
  /** Word timings, already in absolute playback positions. */
  emitWords(words: readonly WordTiming[]): void;
  subscribe(onCue: CueListener, onMood?: MoodListener, onWords?: WordListener): () => void;
}

export function createCueBus(): CueBus {
  const cueListeners = new Set<CueListener>();
  const moodListeners = new Set<MoodListener>();
  const wordListeners = new Set<WordListener>();

  return {
    emit(event) {
      for (const fn of cueListeners) fn(event);
    },
    emitMood(mood) {
      for (const fn of moodListeners) fn(mood);
    },
    emitWords(words) {
      if (!words.length) return;
      for (const fn of wordListeners) fn(words);
    },
    subscribe(onCue, onMood, onWords) {
      cueListeners.add(onCue);
      if (onMood) moodListeners.add(onMood);
      if (onWords) wordListeners.add(onWords);
      return () => {
        cueListeners.delete(onCue);
        if (onMood) moodListeners.delete(onMood);
        if (onWords) wordListeners.delete(onWords);
      };
    },
  };
}

/** Pulls `[tag]` spans out of a text run. */
const TAG_RE = /\[([a-z][a-z-]*)\]/gi;

export function extractTags(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) out.push(m[1].toLowerCase());
  return out;
}

/** Removes `[tag]` spans so the transcript stops showing them as literal text. */
export function stripTags(text: string): string {
  return text.replace(TAG_RE, '').replace(/\s{2,}/g, ' ');
}
