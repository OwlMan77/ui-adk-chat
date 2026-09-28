/**
 * Default skin: inline SVG, drawn procedurally from FaceState every frame.
 *
 * ## What lives where
 *
 * This file is the *renderer*. The shapes it draws -- silhouette, hair, brow
 * curvature, proportions -- are a `Character`, in `characters.ts`, so a new
 * face is a data entry rather than another renderer. Nothing below knows which
 * character it is driving.
 *
 * ## The things that make it read as alive
 *
 *   - **Large eyes** with a real iris, a bright pupil and two specular
 *     highlights at different sizes. The highlights are the cheapest thing that
 *     separates alive from dead, and they sit out on the iris rather than on
 *     the pupil, where two light discs would stack and go muddy.
 *   - **Sliding eyelids**, not shrinking eyes. Blinking by squashing an eye's
 *     `ry` shrinks the whole eyeball; real lids travel across a fixed eye, and
 *     the difference is very visible at 60 fps.
 *   - **A lash line that fades in as the rim fades out.** A lid filled in the
 *     head colour inside an intact rim is an empty socket, not a blink. Cartoon
 *     eyes close to a *line*, so the two cross-fade and a full blink leaves a
 *     single curve.
 *   - **A lower lid that rises with `smile`** -- the Duchenne marker. A smile
 *     that only bends the mouth reads as polite; one that reaches the eyes
 *     reads as felt.
 *   - **Hair as the secondary motion.** Crown pieces swing; side locks swing
 *     nearly twice as hard and settle late. No antenna, by request.
 *
 * Every channel in FaceState gets a visible home; a channel nothing renders is
 * a channel that will silently rot. Colours are theme tokens throughout, so the
 * character follows dark/light/ocean/sunset -- including when the agent switches
 * theme mid-call. Nothing here reads layout, and every frame is attribute writes
 * only.
 *
 * This is a skin, not the architecture. The Skin interface is three methods, so
 * a Rive rig can replace all of it without the audio code knowing.
 */

import type { FaceMode, FaceState, Skin } from '../types';
import type { Character } from './characters';
import { DEFAULT_CHARACTER } from './characters';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Mouth as a two-curve closed path, generated from the parameters. */
function mouthPath(open: number, wide: number, round: number, smile: number, lipClose: number): string {
  const closed = 1 - lipClose;
  const w = 26 + wide * 16 - round * 14;
  const h = 1.5 + open * 30 * closed;
  const c = smile * 9;
  const lower = h * (1.05 + smile * 0.1);

  const x = w.toFixed(2);
  const nx = (-w).toFixed(2);
  const top = (-h * 0.95).toFixed(2);
  const bot = lower.toFixed(2);
  const cy = (-c).toFixed(2);
  const hx = (w * 0.5).toFixed(2);
  const nhx = (-w * 0.5).toFixed(2);

  return `M ${nx} ${cy} C ${nhx} ${top} ${hx} ${top} ${x} ${cy} ` +
         `C ${hx} ${bot} ${nhx} ${bot} ${nx} ${cy} Z`;
}

export function createSvgSkin(character: Character = DEFAULT_CHARACTER): Skin {
  const ch = character;
  const EYE = ch.eye;

  let root: SVGSVGElement | null = null;
  let host: HTMLElement | null = null;

  // Secondary motion. Hair is sprung toward where the head *is*, not toward its
  // per-frame delta: the delta version damps to nothing within a frame or two
  // and the follow-through silently disappears.
  let lag = 0;
  let lagVel = 0;

  const uid = Math.random().toString(36).slice(2, 8);
  const MOUTH_CLIP = `face-mouth-${uid}`;
  const EYE_CLIP_L = `face-eye-l-${uid}`;
  const EYE_CLIP_R = `face-eye-r-${uid}`;

  const refs = {
    headGroup: null as SVGGElement | null,
    faceGroup: null as SVGGElement | null,
    hair: [] as Array<{ node: SVGPathElement; sway: number }>,
    backHair: [] as Array<{ node: SVGPathElement; sway: number }>,
    earL: null as SVGGElement | null,
    earR: null as SVGGElement | null,
    gazeL: null as SVGGElement | null,
    gazeR: null as SVGGElement | null,
    pupilL: null as SVGCircleElement | null,
    pupilR: null as SVGCircleElement | null,
    lidUpL: null as SVGPathElement | null,
    lidUpR: null as SVGPathElement | null,
    lidLoL: null as SVGPathElement | null,
    lidLoR: null as SVGPathElement | null,
    rimL: null as SVGEllipseElement | null,
    rimR: null as SVGEllipseElement | null,
    lidLineL: null as SVGPathElement | null,
    lidLineR: null as SVGPathElement | null,
    lashL: null as SVGGElement | null,
    lashR: null as SVGGElement | null,
    browL: null as SVGPathElement | null,
    browR: null as SVGPathElement | null,
    mouth: null as SVGPathElement | null,
    mouthClip: null as SVGPathElement | null,
    teeth: null as SVGRectElement | null,
    tongue: null as SVGEllipseElement | null,
    lipLine: null as SVGPathElement | null,
    crease: null as SVGPathElement | null,
    cheekL: null as SVGEllipseElement | null,
    cheekR: null as SVGEllipseElement | null,
  };

  const outline = (d: string) => el('path', {
    d,
    fill: 'var(--color-bg-secondary)',
    stroke: 'var(--color-text-primary)',
    'stroke-width': 2.5,
    'stroke-linejoin': 'round',
  });

  /** One ear, grouped so it can rotate about where it meets the head. */
  function makeEar(side: 'L' | 'R'): SVGGElement {
    const g = el('g');
    const dir = side === 'L' ? -1 : 1;
    // Rooted deep inside the silhouette. The ear is drawn behind an opaque
    // head, so everything inboard of the outline is free -- and burying the
    // root is the only way to guarantee the ear reads as attached rather than
    // as a handle floating beside the head.
    const x = 100 + dir * 45;
    g.appendChild(outline(
      `M ${x} 98 C ${x + dir * 26} 88 ${x + dir * 42} 104 ${x + dir * 34} 124 ` +
      `C ${x + dir * 26} 136 ${x + dir * 8} 136 ${x} 128 Z`,
    ));
    return g;
  }

  /** Lash accents at an eye's outer corner, swept up and away from the nose. */
  function makeLashes(side: 'L' | 'R'): SVGGElement {
    const g = el('g');
    const dir = side === 'L' ? -1 : 1;
    const x = (side === 'L' ? EYE.lx - EYE.w : EYE.rx + EYE.w) + dir * 1;
    const y = EYE.cy - EYE.h * 0.45;
    for (const [i, len] of [7, 8.5, 7].entries()) {
      const spread = (i - 1) * 6;
      g.appendChild(el('path', {
        d: `M ${x} ${y + spread} L ${x + dir * len} ${y + spread - len * 0.55}`,
        stroke: 'var(--color-text-primary)',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        fill: 'none',
      }));
    }
    return g;
  }

  function mount(hostEl: HTMLElement) {
    host = hostEl;
    root = el('svg', {
      viewBox: '0 0 200 212',
      width: '100%',
      height: '100%',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    root.style.display = 'block';
    root.style.overflow = 'visible';

    // --- clip paths ---------------------------------------------------------
    const defs = el('defs');

    const mouthClip = el('clipPath', { id: MOUTH_CLIP });
    const mouthClipPath = el('path', { d: mouthPath(0, 0.3, 0, 0, 0) });
    mouthClip.appendChild(mouthClipPath);
    defs.appendChild(mouthClip);
    refs.mouthClip = mouthClipPath;

    // Lids are drawn in the head colour and clipped to the eye, so they read as
    // lids closing over an eye rather than as rectangles crossing the face.
    for (const [id, cx] of [[EYE_CLIP_L, EYE.lx], [EYE_CLIP_R, EYE.rx]] as const) {
      const c = el('clipPath', { id: String(id) });
      c.appendChild(el('ellipse', { cx, cy: EYE.cy, rx: EYE.w, ry: EYE.h }));
      defs.appendChild(c);
    }
    root.appendChild(defs);

    const headGroup = el('g');
    refs.headGroup = headGroup;

    // Behind the head: side locks first, then ears. Both are hidden wherever
    // they pass under the opaque silhouette.
    for (const piece of ch.backHair) {
      const node = outline(piece.d);
      headGroup.appendChild(node);
      refs.backHair.push({ node, sway: piece.sway });
    }
    if (ch.ears) {
      refs.earL = makeEar('L');
      refs.earR = makeEar('R');
      headGroup.appendChild(refs.earL);
      headGroup.appendChild(refs.earR);
    }

    headGroup.appendChild(el('path', {
      d: ch.head,
      fill: 'var(--color-bg-secondary)',
      stroke: 'var(--color-text-primary)',
      'stroke-width': 2.5,
    }));

    for (const piece of ch.hair) {
      const node = outline(piece.d);
      headGroup.appendChild(node);
      refs.hair.push({ node, sway: piece.sway });
    }

    const faceGroup = el('g');
    refs.faceGroup = faceGroup;

    // --- cheeks -------------------------------------------------------------
    refs.cheekL = el('ellipse', {
      cx: 100 - (EYE.rx - EYE.lx) / 2 - 18, cy: ch.cheek.y,
      rx: ch.cheek.rx, ry: ch.cheek.ry, fill: 'var(--color-accent)', opacity: 0,
    });
    refs.cheekR = el('ellipse', {
      cx: 100 + (EYE.rx - EYE.lx) / 2 + 18, cy: ch.cheek.y,
      rx: ch.cheek.rx, ry: ch.cheek.ry, fill: 'var(--color-accent)', opacity: 0,
    });
    faceGroup.appendChild(refs.cheekL);
    faceGroup.appendChild(refs.cheekR);

    // --- nose ---------------------------------------------------------------
    // A face without one reads as a balloon.
    const nw = ch.nose.halfWidth;
    faceGroup.appendChild(el('path', {
      d: `M ${100 - nw} ${ch.nose.y - ch.nose.drop} C ${100 - nw} ${ch.nose.y + ch.nose.drop} ` +
         `${100 + nw} ${ch.nose.y + ch.nose.drop} ${100 + nw} ${ch.nose.y - ch.nose.drop}`,
      fill: 'none',
      stroke: 'var(--color-text-primary)',
      'stroke-width': 3,
      'stroke-linecap': 'round',
      opacity: ch.nose.opacity,
    }));

    // --- mouth --------------------------------------------------------------
    // The crease under the mouth deepens as the jaw drops, which is what sells
    // the drop as a jaw rather than as a hole opening in a flat surface.
    refs.crease = el('path', {
      d: `M 84 ${ch.mouthY + 22} Q 100 ${ch.mouthY + 29} 116 ${ch.mouthY + 22}`,
      fill: 'none',
      stroke: 'var(--color-text-primary)',
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      opacity: 0,
    });
    faceGroup.appendChild(refs.crease);

    const mouthGroup = el('g', { transform: `translate(100 ${ch.mouthY})` });
    refs.mouth = el('path', {
      d: mouthPath(0, 0.3, 0, 0, 0),
      fill: 'var(--color-bg-primary)',
      stroke: 'var(--color-text-primary)',
      'stroke-width': 2.5,
      'stroke-linejoin': 'round',
    });
    refs.tongue = el('ellipse', {
      cx: 0, cy: 16, rx: 15, ry: 9,
      fill: 'var(--color-accent)',
      opacity: 0,
      'clip-path': `url(#${MOUTH_CLIP})`,
    });
    refs.teeth = el('rect', {
      x: -40, y: -34, width: 80, height: 9, rx: 3,
      fill: 'var(--color-text-primary)',
      opacity: 0,
      'clip-path': `url(#${MOUTH_CLIP})`,
    });
    mouthGroup.appendChild(refs.mouth);
    mouthGroup.appendChild(refs.tongue);
    mouthGroup.appendChild(refs.teeth);

    if (ch.lips) {
      // A cupid's bow above the upper lip. It fades out as the mouth opens,
      // because a lip line floating above a wide-open mouth reads as a smudge.
      refs.lipLine = el('path', {
        d: 'M -16 -8 Q -8 -12 0 -8.5 Q 8 -12 16 -8',
        fill: 'none',
        stroke: 'var(--color-text-primary)',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        opacity: 0.4,
      });
      mouthGroup.appendChild(refs.lipLine);
    }
    faceGroup.appendChild(mouthGroup);

    // --- eyes ---------------------------------------------------------------
    for (const side of ['L', 'R'] as const) {
      const cx = side === 'L' ? EYE.lx : EYE.rx;
      const clip = side === 'L' ? EYE_CLIP_L : EYE_CLIP_R;

      // Sclera only -- no stroke. The outline is the `rim` below, which fades
      // out as the eye closes; a stroke here as well would survive that fade
      // and leave a hard ring around every blink.
      faceGroup.appendChild(el('ellipse', {
        cx, cy: EYE.cy, rx: EYE.w, ry: EYE.h,
        fill: 'var(--color-bg-primary)',
      }));

      // Iris, pupil and both highlights ride in one group, so gaze is a single
      // transform write per eye instead of eight attribute writes. The
      // highlights sit out on the iris: stacked on the pupil they are two light
      // discs on top of each other and the eye goes muddy.
      const gaze = el('g', { 'clip-path': `url(#${clip})` });
      gaze.appendChild(el('circle', { cx, cy: EYE.cy, r: EYE.iris, fill: 'var(--color-accent)' }));
      const pupil = el('circle', { cx, cy: EYE.cy, r: EYE.pupil, fill: 'var(--color-text-primary)' });
      gaze.appendChild(pupil);
      gaze.appendChild(el('circle', {
        cx: cx - EYE.iris * 0.54, cy: EYE.cy - EYE.iris * 0.58, r: EYE.iris * 0.32,
        fill: 'var(--color-accent-text)', opacity: 0.95,
      }));
      gaze.appendChild(el('circle', {
        cx: cx + EYE.iris * 0.5, cy: EYE.cy + EYE.iris * 0.5, r: EYE.iris * 0.15,
        fill: 'var(--color-accent-text)', opacity: 0.6,
      }));
      faceGroup.appendChild(gaze);

      const lidLo = el('path', { d: '', fill: 'var(--color-bg-secondary)', 'clip-path': `url(#${clip})` });
      const lidUp = el('path', { d: '', fill: 'var(--color-bg-secondary)', 'clip-path': `url(#${clip})` });
      faceGroup.appendChild(lidLo);
      faceGroup.appendChild(lidUp);

      const rim = el('ellipse', {
        cx, cy: EYE.cy, rx: EYE.w, ry: EYE.h,
        fill: 'none',
        stroke: 'var(--color-text-primary)',
        'stroke-width': 2,
      });
      faceGroup.appendChild(rim);

      // The lash line: the lid's own leading edge, stroked. Deliberately
      // unclipped -- clipped to the eye, a fully-closed lid line falls on the
      // rim and vanishes exactly when it is most needed.
      const lidLine = el('path', {
        d: '', fill: 'none',
        stroke: 'var(--color-text-primary)',
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
        opacity: 0,
      });
      faceGroup.appendChild(lidLine);

      let lashes: SVGGElement | null = null;
      if (ch.lashes) {
        lashes = makeLashes(side);
        faceGroup.appendChild(lashes);
      }

      if (side === 'L') {
        refs.gazeL = gaze; refs.pupilL = pupil;
        refs.lidUpL = lidUp; refs.lidLoL = lidLo;
        refs.rimL = rim; refs.lidLineL = lidLine; refs.lashL = lashes;
      } else {
        refs.gazeR = gaze; refs.pupilR = pupil;
        refs.lidUpR = lidUp; refs.lidLoR = lidLo;
        refs.rimR = rim; refs.lidLineR = lidLine; refs.lashR = lashes;
      }
    }

    // --- brows --------------------------------------------------------------
    // Rotated about their outer end rather than bent at a control point:
    // rotation is what reads unambiguously as angry or sad.
    refs.browL = el('path', {
      d: ch.brow.l,
      stroke: 'var(--color-text-primary)',
      'stroke-width': ch.brow.width,
      'stroke-linecap': 'round',
      fill: 'none',
    });
    refs.browR = el('path', {
      d: ch.brow.r,
      stroke: 'var(--color-text-primary)',
      'stroke-width': ch.brow.width,
      'stroke-linecap': 'round',
      fill: 'none',
    });
    faceGroup.appendChild(refs.browL);
    faceGroup.appendChild(refs.browR);

    headGroup.appendChild(faceGroup);
    root.appendChild(headGroup);
    host.appendChild(root);
  }

  function apply(s: FaceState, mode: FaceMode) {
    if (!root) return;

    // --- head: breathing, bob, tilt, gaze parallax --------------------------
    const bob = -s.headBob * 7;
    const scale = 1 + s.breathe * 0.012;
    const tilt = s.headTilt * 4;
    refs.headGroup?.setAttribute(
      'transform',
      `translate(${(s.lookX * 3).toFixed(2)} ${(bob + s.lookY * -2).toFixed(2)}) ` +
      `rotate(${tilt.toFixed(2)} 100 120) scale(${scale.toFixed(4)})`,
    );

    // --- secondary motion ----------------------------------------------------
    const lagTarget = s.headTilt * 3.2 - s.headBob * 2.4;
    lagVel += (lagTarget - lag) * 0.14;
    lagVel *= 0.86;
    lag += lagVel;
    lag = Math.max(-4, Math.min(4, lag));

    for (const { node, sway } of refs.hair) {
      node.setAttribute(
        'transform',
        `rotate(${(lag * 2.4 * sway).toFixed(2)} 100 34) translate(0 ${(-s.headBob * 1.8 * sway).toFixed(2)})`,
      );
    }
    // Side locks pivot high, near the crown, so their free ends travel furthest.
    for (const { node, sway } of refs.backHair) {
      node.setAttribute(
        'transform',
        `rotate(${(lag * 2.4 * sway).toFixed(2)} 100 60) translate(0 ${(-s.headBob * 1.4 * sway).toFixed(2)})`,
      );
    }

    const perk = s.energy * 6;
    refs.earL?.setAttribute('transform', `rotate(${(lag * 0.8 + perk).toFixed(2)} 55 113)`);
    refs.earR?.setAttribute('transform', `rotate(${(lag * 0.8 - perk).toFixed(2)} 145 113)`);

    // --- eyes ----------------------------------------------------------------
    // Both lids converge on a meeting line a little below the eye's centre,
    // which is where real lids meet. Running the upper lid all the way to the
    // bottom rim instead puts the closed-eye line at the narrowest part of the
    // ellipse, where a full-width line cannot fit: it overhangs both corners
    // and the two eyes join up across the bridge of the nose.
    const closure = 1 - s.eyeOpen;
    const eyeTop = EYE.cy - EYE.h;
    const meetY = EYE.cy + EYE.h * 0.1;
    const lidY = eyeTop + closure * (meetY - eyeTop);
    const top = eyeTop - 6;
    const upD = (cx: number) => {
      const l = cx - EYE.w - 3;
      const r = cx + EYE.w + 3;
      return `M ${l} ${lidY.toFixed(2)} Q ${cx} ${(lidY + 5).toFixed(2)} ${r} ${lidY.toFixed(2)} ` +
             `L ${r} ${top} L ${l} ${top} Z`;
    };
    refs.lidUpL?.setAttribute('d', upD(EYE.lx));
    refs.lidUpR?.setAttribute('d', upD(EYE.rx));

    // The lash line fades in as the rim fades out, so a blink closes to a curve
    // instead of leaving an empty socket.
    //
    // It is the one part of the eye that is deliberately unclipped, so it has
    // to measure the ellipse itself: half-width at the lid's own height. The
    // lid fills can span the full width because the clip trims them; this
    // cannot, and a fixed-width line fits only at the exact centre.
    const k = (lidY - EYE.cy) / EYE.h;
    const hw = EYE.w * Math.sqrt(Math.max(0, 1 - k * k)) + 1;
    const shut = Math.min(1, closure * 1.6);
    const lineD = (cx: number) =>
      `M ${(cx - hw).toFixed(2)} ${lidY.toFixed(2)} ` +
      `Q ${cx} ${(lidY + 4).toFixed(2)} ${(cx + hw).toFixed(2)} ${lidY.toFixed(2)}`;
    refs.lidLineL?.setAttribute('d', lineD(EYE.lx));
    refs.lidLineR?.setAttribute('d', lineD(EYE.rx));
    refs.lidLineL?.setAttribute('opacity', shut.toFixed(3));
    refs.lidLineR?.setAttribute('opacity', shut.toFixed(3));

    // The rim has to reach zero *before* the eye is fully shut, or a ghost
    // outline sits around the closed lid and the blink reads as an open eye
    // with a line drawn under it.
    const rimOpacity = Math.max(0, Math.min(1, (s.eyeOpen - 0.1) / 0.45)).toFixed(3);
    refs.rimL?.setAttribute('opacity', rimOpacity);
    refs.rimR?.setAttribute('opacity', rimOpacity);

    // Lashes ride on the lid, so they travel down with a blink.
    const lashShift = (lidY - eyeTop).toFixed(2);
    refs.lashL?.setAttribute('transform', `translate(0 ${lashShift})`);
    refs.lashR?.setAttribute('transform', `translate(0 ${lashShift})`);

    // The lower lid rises with a smile -- the Duchenne marker, without which a
    // smile is polite rather than felt -- and rises again to meet the upper lid
    // as the eye closes, so the two shut together instead of the upper lid
    // sweeping past a stationary lower one.
    const eyeBottom = EYE.cy + EYE.h;
    const squint = Math.max(0, s.smile) * EYE.h * 0.42;
    const loY = eyeBottom - squint - closure * (eyeBottom - meetY);
    const bottom = eyeBottom + 6;
    const loD = (cx: number) => {
      const l = cx - EYE.w - 3;
      const r = cx + EYE.w + 3;
      return `M ${l} ${loY.toFixed(2)} Q ${cx} ${(loY - 5 - squint * 0.3).toFixed(2)} ${r} ${loY.toFixed(2)} ` +
             `L ${r} ${bottom} L ${l} ${bottom} Z`;
    };
    refs.lidLoL?.setAttribute('d', loD(EYE.lx));
    refs.lidLoR?.setAttribute('d', loD(EYE.rx));

    // Gaze.
    const gt = `translate(${(s.lookX * 7).toFixed(2)} ${(s.lookY * -6).toFixed(2)})`;
    refs.gazeL?.setAttribute('transform', gt);
    refs.gazeR?.setAttribute('transform', gt);

    // Pupils dilate with energy -- small, but it is the difference between
    // engaged and glazed.
    const pr = (EYE.pupil + s.energy * 1.6).toFixed(2);
    refs.pupilL?.setAttribute('r', pr);
    refs.pupilR?.setAttribute('r', pr);

    // --- brows ----------------------------------------------------------------
    const browY = ch.brow.y - s.browRaise * ch.brow.lift + lag;
    const angle = s.browAngle * 11;
    refs.browL?.setAttribute(
      'transform',
      `translate(0 ${browY.toFixed(2)}) rotate(${(-angle).toFixed(2)} ${ch.brow.pivotL} 0)`,
    );
    refs.browR?.setAttribute(
      'transform',
      `translate(0 ${browY.toFixed(2)}) rotate(${angle.toFixed(2)} ${ch.brow.pivotR} 0)`,
    );

    // --- mouth -----------------------------------------------------------------
    const d = mouthPath(s.open, s.wide, s.round, s.smile, s.lipClose);
    refs.mouth?.setAttribute('d', d);
    refs.mouthClip?.setAttribute('d', d);

    const h = 1.5 + s.open * 30 * (1 - s.lipClose);
    refs.teeth?.setAttribute('opacity', (s.teeth * 0.9).toFixed(3));
    refs.teeth?.setAttribute('y', (-h * 0.95).toFixed(2));
    refs.teeth?.setAttribute('height', Math.max(2, Math.min(10, h * 0.55)).toFixed(2));

    // The tongue only appears once the mouth is genuinely open, and sits at the
    // floor of it, so it adds depth without ever reading as a lolling tongue.
    const tongue = Math.max(0, s.open - 0.35) * 1.4 * (1 - s.lipClose);
    refs.tongue?.setAttribute('opacity', Math.min(0.75, tongue).toFixed(3));
    refs.tongue?.setAttribute('cy', (h * 0.55).toFixed(2));

    refs.lipLine?.setAttribute('opacity', (Math.max(0, 1 - s.open * 3) * 0.4).toFixed(3));
    refs.lipLine?.setAttribute('transform', `translate(0 ${(-h * 0.6).toFixed(2)})`);

    refs.crease?.setAttribute('opacity', (Math.min(1, s.open * 1.2) * 0.3).toFixed(3));

    // --- cheeks ------------------------------------------------------------------
    const blush = Math.max(0, s.smile) * 0.35;
    refs.cheekL?.setAttribute('opacity', blush.toFixed(3));
    refs.cheekR?.setAttribute('opacity', blush.toFixed(3));

    // Waking from a cold start reads as sleepy rather than broken.
    refs.faceGroup?.setAttribute('opacity', mode === 'waking' ? '0.75' : '1');
  }

  function unmount() {
    if (root && host && root.parentNode === host) host.removeChild(root);
    root = null;
    host = null;
  }

  return { mount, apply, unmount };
}
