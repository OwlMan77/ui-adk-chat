/**
 * Characters: the geometry a skin draws, separated from the code that animates it.
 *
 * The rig drives fifteen channels and knows nothing about who it is driving.
 * A Character is purely the shapes and proportions -- silhouette, hair, brow
 * curvature, where the eyes sit -- so adding a face is adding a data entry, not
 * another renderer. `svgSkin.ts` consumes one of these and is the only code
 * that touches the DOM.
 *
 * There are two, and they are not the same character with different hair. The
 * differences are structural, because that is where a face actually reads
 * from: the jaw taper, the brow arch and weight, the eye size, the mass of the
 * hair and how hard it swings. The accessories (lashes, lip line) are the small
 * part.
 *
 * Both are available to every agent. `characterFor()` only picks a default.
 */

export interface HairPiece {
  d: string;
  /** How hard this piece swings with head motion. 1 = with the crest. */
  sway: number;
}

export interface Character {
  id: string;
  label: string;
  /** Head silhouette. */
  head: string;
  /** Hair drawn over the crown. */
  hair: readonly HairPiece[];
  /** Hair drawn behind the head -- side locks, which swing hardest. */
  backHair: readonly HairPiece[];
  /** Ears, drawn behind the head. Hair that covers the sides should skip them. */
  ears: boolean;
  /** Lash accents at the outer eye corners; they travel with the upper lid. */
  lashes: boolean;
  /** A cupid's-bow line above the mouth, which reads as lip volume. */
  lips: boolean;
  brow: {
    l: string;
    r: string;
    /** Stroke weight. Heavier reads more masculine, and is the single loudest cue. */
    width: number;
    /** Resting y of the brow group. */
    y: number;
    /** How far browRaise lifts it. */
    lift: number;
    /** x each brow rotates about, at its outer end. */
    pivotL: number;
    pivotR: number;
  };
  eye: { lx: number; rx: number; cy: number; w: number; h: number; iris: number; pupil: number };
  nose: { y: number; halfWidth: number; drop: number; opacity: number };
  mouthY: number;
  cheek: { y: number; rx: number; ry: number };
}

/**
 * Orin -- broad and grounded. The gender-neutral default.
 *
 * Narrow crown, widest across the cheeks, still broad at the jaw: the mass sits
 * low. A short quiff swept to one side, and ears.
 *
 * The brow weight is the thing that decides how this one reads. At 5 it was
 * heavy enough to code masculine on its own; at 4.2 the face sits neutral and
 * the silhouette does the work instead. If a deliberately masculine character
 * is ever wanted, a third entry taking this one back to a heavy straight brow
 * and a squarer jaw is the whole job.
 */
export const ORIN: Character = {
  id: 'orin',
  label: 'Orin',
  head:
    'M 100 22 C 128 22 146 34 152 60 ' +
    'C 160 92 172 130 164 158 ' +
    'C 154 184 130 197 100 197 ' +
    'C 70 197 46 184 36 158 ' +
    'C 28 130 40 92 48 60 ' +
    'C 54 34 72 22 100 22 Z',
  hair: [
    {
      // One connected quiff with two notches in its outline, rooted into the
      // crown and swept right. Separate blobs read as floating bubbles.
      d: 'M 78 38 C 70 18 82 -2 100 2 ' +
         'C 98 10 102 14 107 12 ' +
         'C 120 -4 140 6 133 22 ' +
         'C 129 31 114 37 105 33 ' +
         'C 96 40 84 42 78 38 Z',
      sway: 1,
    },
  ],
  backHair: [],
  ears: true,
  lashes: false,
  lips: false,
  brow: {
    l: 'M 50 0 C 60 -9 80 -9 90 -2',
    r: 'M 110 -2 C 120 -9 140 -9 150 0',
    width: 4.2,
    y: 66,
    lift: 10,
    pivotL: 50,
    pivotR: 150,
  },
  eye: { lx: 70, rx: 130, cy: 98, w: 19, h: 21, iris: 12, pupil: 5 },
  nose: { y: 127, halfWidth: 7, drop: 4, opacity: 0.75 },
  mouthY: 154,
  cheek: { y: 132, rx: 14, ry: 8.5 },
};

/**
 * Wren -- softer and taller.
 *
 * Widest at the cheekbones and tapering to a narrow rounded chin, which is the
 * inverse of Orin's low mass. Finer, higher, more arched brows. Larger eyes
 * with lash accents, a smaller nose, and a lip line. The hair is a full crown
 * sweep with a parting, plus two side locks that hang past the jaw -- and those
 * locks are the reason this face animates better than Orin: they are long, they
 * swing hardest, and they keep moving after the head has stopped. Ears are off
 * because the locks would cover them.
 */
export const WREN: Character = {
  id: 'wren',
  label: 'Wren',
  head:
    'M 100 20 C 132 20 152 36 156 68 ' +
    'C 160 100 152 142 134 168 ' +
    'C 126 182 114 196 100 196 ' +
    'C 86 196 74 182 66 168 ' +
    'C 48 142 40 100 44 68 ' +
    'C 48 36 68 20 100 20 Z',
  hair: [
    {
      // Crown mass with a parting. The outer edge sits proud of the skull, so
      // the silhouette gains volume rather than just gaining a line.
      d: 'M 40 86 C 33 40 62 4 100 4 ' +
         'C 138 4 167 40 160 86 ' +
         'C 153 56 137 43 113 41 ' +
         'C 105 52 92 54 84 45 ' +
         'C 61 51 46 63 40 86 Z',
      sway: 1,
    },
  ],
  backHair: [
    // Wide enough to read as hair rather than as a tube, and rooted at x~66 --
    // well inside the silhouette, so the crown mass appears to continue into
    // them instead of two crescents hanging beside the face.
    {
      d: 'M 66 56 C 30 86 24 140 36 172 ' +
         'C 44 188 68 188 70 170 ' +
         'C 54 140 52 96 72 64 Z',
      sway: 1.9,
    },
    {
      d: 'M 134 56 C 170 86 176 140 164 172 ' +
         'C 156 188 132 188 130 170 ' +
         'C 146 140 148 96 128 64 Z',
      sway: 1.9,
    },
  ],
  ears: false,
  lashes: true,
  lips: true,
  brow: {
    // Finer and considerably more arched than Orin's.
    l: 'M 52 2 C 63 -12 82 -13 91 -3',
    r: 'M 109 -3 C 118 -13 137 -12 148 2',
    width: 3.5,
    y: 65,
    lift: 11,
    pivotL: 52,
    pivotR: 148,
  },
  eye: { lx: 70, rx: 130, cy: 100, w: 20, h: 22.5, iris: 13, pupil: 5.2 },
  nose: { y: 129, halfWidth: 5, drop: 3.5, opacity: 0.6 },
  mouthY: 158,
  cheek: { y: 135, rx: 13, ry: 8 },
};

export const CHARACTERS: Record<string, Character> = { orin: ORIN, wren: WREN };

export const DEFAULT_CHARACTER = ORIN;

/**
 * Which character an agent wears by default.
 *
 * Deliberately a lookup with a fallback rather than anything clever: agents
 * come from the backend at runtime, so an unknown name has to land somewhere
 * sensible. Callers can always pass a Character explicitly and override this.
 */
// Keys are the names `/list-apps` returns -- which is what LiveCallView is
// handed as `agentName` -- not the backend's Python module names. Those two
// differ (`adk-csm-live` vs `csm_agent`), and getting it wrong fails silently:
// every lookup misses, everyone falls back to the default, and the app looks
// like it is working. The module names are kept as aliases so either spelling
// resolves.
const BY_AGENT: Record<string, Character> = {
  'adk-csm-live': WREN,
  'car-seller': ORIN,
  csm_agent: WREN,
  car_seller_agent: ORIN,
};

export function characterFor(agentName?: string): Character {
  if (!agentName) return DEFAULT_CHARACTER;

  const found = BY_AGENT[agentName] ?? CHARACTERS[agentName];
  if (found) return found;

  // Say so in dev. Falling back silently is what let a wrong key here go
  // unnoticed -- the face still rendered, just never the intended one.
  if (import.meta.env.DEV) {
    console.warn(
      `[face] no character mapped for agent "${agentName}" — using ${DEFAULT_CHARACTER.label}. ` +
      `Add it to BY_AGENT in src/face/skins/characters.ts.`,
    );
  }
  return DEFAULT_CHARACTER;
}
