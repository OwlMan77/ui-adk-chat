/**
 * The expression lane: cue tags and mood -> a pose.
 *
 * This is the slow lane. It retargets about once per utterance and eases over
 * a few hundred ms; only the mouth runs at frame rate. Expression changing at
 * frame rate is the main cause of a face looking unstable.
 *
 * The tags are the ones the agent already emits (see the INSTRUCTION in
 * adk-csm-live/app/csm_agent/agent.py). One label, two consumers: the same cue
 * goes to the speech engine for prosody and to the face for expression, so the
 * two cannot desync.
 */

export type Mood = 'neutral' | 'warm' | 'urgent' | 'amused' | 'concerned';

export interface ExpressionPose {
  smile: number;
  browRaise: number;
  browAngle: number;
  headTilt: number;
  headBob: number;
  energy: number;
  /** Multiplies the idle eyeOpen, for squints and wide eyes. */
  eyeScale: number;
}

function pose(p: Partial<ExpressionPose>): ExpressionPose {
  return {
    smile: 0, browRaise: 0, browAngle: 0, headTilt: 0,
    headBob: 0, energy: 0.35, eyeScale: 1, ...p,
  };
}

export const MOOD_POSES: Record<Mood, ExpressionPose> = {
  neutral:   pose({ smile: 0.12, energy: 0.35 }),
  warm:      pose({ smile: 0.55, browRaise: 0.12, energy: 0.45, eyeScale: 0.94 }),
  urgent:    pose({ smile: -0.05, browRaise: 0.30, browAngle: -0.35, energy: 0.85, headBob: 0.18 }),
  amused:    pose({ smile: 0.75, browRaise: 0.35, energy: 0.65, eyeScale: 0.88 }),
  concerned: pose({ smile: -0.25, browRaise: 0.20, browAngle: 0.55, energy: 0.30, eyeScale: 0.96 }),
};

interface CuePreset {
  pose: Partial<ExpressionPose>;
  holdMs: number;
  /** Blink on arrival -- masks the pose change and reads as deliberate. */
  blink: boolean;
}

const cue = (p: Partial<ExpressionPose>, holdMs = 900, blink = false): CuePreset =>
  ({ pose: p, holdMs, blink });

/**
 * Exact tags first, then prefix families. The agent is told not to overuse
 * these, so each one arriving should visibly land.
 */
const TAG_PRESETS: Record<string, CuePreset> = {
  'laughter':            cue({ smile: 1, browRaise: 0.5, eyeScale: 0.35, headTilt: 0.25, headBob: 0.5, energy: 1 }, 1400, true),
  'sigh':                cue({ smile: -0.2, browRaise: -0.1, browAngle: 0.4, eyeScale: 0.7, energy: 0.15 }, 1100, true),
  'confirmation-en':     cue({ smile: 0.4, browRaise: 0.15, headBob: 0.45, energy: 0.5 }, 650),
  'dissatisfaction-hnn': cue({ smile: -0.45, browAngle: -0.6, browRaise: 0.1, eyeScale: 0.8, energy: 0.4 }, 950),
};

const TAG_FAMILIES: Array<[string, CuePreset]> = [
  ['question-', cue({ browRaise: 0.85, headTilt: 0.45, smile: 0.2, energy: 0.5 }, 900)],
  ['surprise-', cue({ browRaise: 1, eyeScale: 1.25, smile: 0.35, energy: 0.9, headBob: 0.3 }, 850, true)],
];

export function presetForTag(rawTag: string): CuePreset | null {
  const tag = rawTag.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (TAG_PRESETS[tag]) return TAG_PRESETS[tag];
  for (const [prefix, preset] of TAG_FAMILIES) {
    if (tag.startsWith(prefix)) return preset;
  }
  return null;
}

export interface ExpressionLane {
  setMood(mood: Mood): void;
  /** Queue a cue to fire at a given audio-clock time, in ms. */
  pushCue(tag: string, atMs: number): void;
  update(nowMs: number): ExpressionPose;
  /** True on the frame a cue wanting a blink became active. */
  consumeBlinkRequest(): boolean;
  reset(): void;
}

interface Scheduled { preset: CuePreset; atMs: number; fired: boolean }

/** Cue envelope: quick in, hold, ease out. */
function envelope(elapsed: number, holdMs: number): number {
  const attack = 140;
  const release = 420;
  if (elapsed < 0) return 0;
  if (elapsed < attack) return elapsed / attack;
  if (elapsed < attack + holdMs) return 1;
  const t = (elapsed - attack - holdMs) / release;
  return t >= 1 ? 0 : 1 - t * t;
}

export function createExpressionLane(): ExpressionLane {
  let mood: Mood = 'neutral';
  let queue: Scheduled[] = [];
  let blinkRequested = false;

  function pushCue(tag: string, atMs: number) {
    const preset = presetForTag(tag);
    if (!preset) return;
    queue.push({ preset, atMs, fired: false });
  }

  function update(nowMs: number): ExpressionPose {
    const base = MOOD_POSES[mood];
    const out: ExpressionPose = { ...base };

    const survivors: Scheduled[] = [];
    for (const item of queue) {
      const elapsed = nowMs - item.atMs;
      const total = 140 + item.preset.holdMs + 420;
      if (elapsed > total) continue;
      survivors.push(item);

      if (!item.fired && elapsed >= 0) {
        item.fired = true;
        if (item.preset.blink) blinkRequested = true;
      }

      const w = envelope(elapsed, item.preset.holdMs);
      if (w <= 0) continue;

      const p = item.preset.pose;
      if (p.smile !== undefined) out.smile += (p.smile - out.smile) * w;
      if (p.browRaise !== undefined) out.browRaise += (p.browRaise - out.browRaise) * w;
      if (p.browAngle !== undefined) out.browAngle += (p.browAngle - out.browAngle) * w;
      if (p.headTilt !== undefined) out.headTilt += (p.headTilt - out.headTilt) * w;
      if (p.headBob !== undefined) out.headBob = Math.max(out.headBob, p.headBob * w);
      if (p.energy !== undefined) out.energy += (p.energy - out.energy) * w;
      if (p.eyeScale !== undefined) out.eyeScale += (p.eyeScale - out.eyeScale) * w;
    }
    queue = survivors;

    return out;
  }

  return {
    setMood(m) { mood = m; },
    pushCue,
    update,
    consumeBlinkRequest() {
      const v = blinkRequested;
      blinkRequested = false;
      return v;
    },
    reset() {
      mood = 'neutral';
      queue = [];
      blinkRequested = false;
    },
  };
}
