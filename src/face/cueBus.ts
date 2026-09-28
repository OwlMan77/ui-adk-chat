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

/**
 * Pulls `[tag]` spans out of a text run.
 *
 * Kept deliberately in step with the server's own vocabulary in `app/cues.py`.
 * The colon matters: the agent opens each reply with `[mood:warm]`, and a
 * pattern that only allowed letters and hyphens matched `[laughter]` but not
 * `[mood:warm]` -- which then survived stripping and appeared verbatim in the
 * transcript, which is the exact bug this pair of functions exists to prevent.
 *
 * Narrow on purpose either way: ordinary bracketed prose, and the `[0]`/`[1]`
 * of an array index in a code answer, have to pass through untouched.
 */
const TAG_RE = /\[([a-z][a-z0-9]*(?:[-:][a-z0-9]+)*)\]/gi;

const MOOD_RE = /^mood[-:]([a-z]+)$/i;

const MOODS: readonly Mood[] = ['neutral', 'warm', 'urgent', 'amused', 'concerned'];

/** Non-verbal cues. Mood is not one -- it is a whole-reply label, see extractMood. */
export function extractTags(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    const tag = m[1].toLowerCase();
    if (!MOOD_RE.test(tag)) out.push(tag);
  }
  return out;
}

/**
 * The reply's mood, when the agent declared one.
 *
 * Only needed as a fallback: normally the mood arrives on the cue frame
 * alongside the audio, which is the copy that cannot drift from the voice. This
 * reads it out of the text instead, for when the server sends no cue frame at
 * all -- an older build, or a synthesis failure, which is precisely when the
 * face going blank would be most confusing.
 */
export function extractMood(text: string): Mood | undefined {
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    const mood = MOOD_RE.exec(m[1].toLowerCase())?.[1] as Mood | undefined;
    if (mood && MOODS.includes(mood)) return mood;
  }
  return undefined;
}

/** Removes `[tag]` spans so the transcript stops showing them as literal text. */
export function stripTags(text: string): string {
  return text
    .replace(TAG_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trimStart();
}
