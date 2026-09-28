/** Dev-only: renders the rig at fixed states so every mouth shape can be eyeballed at once. */
import { useEffect, useRef } from 'react';
import { createSvgSkin } from './skins/svgSkin';
import { restingFace } from './types';
import type { FaceState } from './types';
import { VISEMES } from './visemes';
import { CHARACTERS } from './skins/characters';
import type { Character } from './skins/characters';

const POSES: Array<[string, Partial<FaceState>]> = [
  ['rest', {}],
  ['AI (open)', { ...VISEMES.AI, open: 0.9 }],
  ['E (wide)', { ...VISEMES.E, open: 0.5 }],
  ['O (round)', { ...VISEMES.O, open: 0.6 }],
  ['WQ (pucker)', { ...VISEMES.WQ }],
  ['MBP (closed)', { ...VISEMES.MBP }],
  ['SCH (teeth)', { ...VISEMES.SCH }],
  ['FV (teeth)', { ...VISEMES.FV }],
  ['laughing', { ...VISEMES.AI, open: 0.8, smile: 1, browRaise: 0.5, eyeOpen: 0.35, headTilt: 0.25 }],
  ['surprised', { ...VISEMES.O, open: 0.7, browRaise: 1, eyeOpen: 1, smile: 0.35 }],
  ['concerned', { smile: -0.25, browRaise: 0.2, browAngle: 0.55, eyeOpen: 0.96, open: 0.05 }],
  ['angry', { smile: -0.45, browAngle: -0.6, browRaise: 0.1, eyeOpen: 0.8, open: 0.1 }],
  // Three points through the blink, not just the end of it: the lid has to fit
  // the ellipse at every height it passes, and mid-travel is where a
  // fixed-width lash line overhangs the corners most visibly.
  ['blink 25%', { eyeOpen: 0.75 }],
  ['blink 60%', { eyeOpen: 0.4 }],
  ['blink', { eyeOpen: 0.05 }],
  ['looking away', { lookX: 1, lookY: -0.6, headTilt: 0.5 }],
];

function Cell({ label, pose, character }: { label: string; pose: Partial<FaceState>; character: Character }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const skin = createSvgSkin(character);
    skin.mount(host);
    const state: FaceState = { ...restingFace(), ...pose };
    skin.apply(state, 'idle');
    return () => skin.unmount();
  }, [pose, character]);
  return (
    <div style={{ textAlign: 'center' }}>
      <div ref={ref} style={{ width: 150, height: 158 }} />
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );
}

export default function ShapeSheet() {
  return (
    <div style={{ padding: 20 }}>
      {Object.values(CHARACTERS).map((character) => (
        <section key={character.id} style={{ marginBottom: 28 }}>
          <h2 style={{ font: '600 14px system-ui', color: 'var(--color-text-primary)', margin: '0 0 10px' }}>
            {character.label}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {POSES.map(([label, pose]) => (
              <Cell key={label} label={label} pose={pose} character={character} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
