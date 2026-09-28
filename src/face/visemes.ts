/**
 * Nine mouth shapes in the Preston Blair / Rhubarb lineage, expressed as points
 * in MouthParams space rather than as nine drawn paths.
 *
 * Cartoon animators settled on roughly this set eighty years ago and it is
 * plenty for a stylized face -- VRM gets away with five. Keeping them as points
 * in a continuous space means the classifier, the (future) phoneme path and the
 * expression lane can all write the same numbers and blend.
 */

import type { MouthParams } from './types';

export type VisemeKey = 'X' | 'MBP' | 'FV' | 'AI' | 'E' | 'O' | 'WQ' | 'L' | 'SCH';

export const VISEMES: Record<VisemeKey, MouthParams> = {
  /** rest / silence */
  X:   { open: 0.04, wide: 0.30, round: 0.00, teeth: 0.00, lipClose: 0.00 },
  /** m b p -- lips pressed together */
  MBP: { open: 0.00, wide: 0.35, round: 0.00, teeth: 0.00, lipClose: 1.00 },
  /** f v -- lower lip under teeth */
  FV:  { open: 0.15, wide: 0.50, round: 0.00, teeth: 1.00, lipClose: 0.25 },
  /** a ae aI -- wide open */
  AI:  { open: 0.90, wide: 0.60, round: 0.10, teeth: 0.20, lipClose: 0.00 },
  /** E I eI -- mid, spread */
  E:   { open: 0.45, wide: 0.85, round: 0.00, teeth: 0.35, lipClose: 0.00 },
  /** O oU -- rounded mid */
  O:   { open: 0.60, wide: 0.20, round: 0.80, teeth: 0.00, lipClose: 0.00 },
  /** u w -- small round pucker */
  WQ:  { open: 0.30, wide: 0.05, round: 1.00, teeth: 0.00, lipClose: 0.00 },
  /** l r -- open with tongue up. Only reachable from the phoneme path. */
  L:   { open: 0.50, wide: 0.45, round: 0.00, teeth: 0.40, lipClose: 0.00 },
  /** s z S tS -- narrow slit, teeth showing */
  SCH: { open: 0.18, wide: 0.55, round: 0.05, teeth: 0.90, lipClose: 0.00 },
};

/** How much of the jaw each shape wants when amplitude is at full. */
export function shapeOpenness(key: VisemeKey): number {
  return VISEMES[key].open;
}

export function lerpMouth(a: MouthParams, b: MouthParams, t: number): MouthParams {
  return {
    open: a.open + (b.open - a.open) * t,
    wide: a.wide + (b.wide - a.wide) * t,
    round: a.round + (b.round - a.round) * t,
    teeth: a.teeth + (b.teeth - a.teeth) * t,
    lipClose: a.lipClose + (b.lipClose - a.lipClose) * t,
  };
}
