import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import styles from './agent-face.module.css';
import { createSvgSkin } from './skins/svgSkin';
import { useFaceDriver } from './useFaceDriver';
import { useReducedMotion } from './useReducedMotion';
import { createMusicDriver } from './music';
import type { MusicDriver, MusicAnalysis } from './music';
import type { Skin } from './types';
import type { CueBus } from './cueBus';
import type { Character } from './skins/characters';
import { DEFAULT_CHARACTER } from './skins/characters';

interface Props {
  /** Analyser on the agent's TTS playback. */
  analyserRef: RefObject<AnalyserNode | null>;
  /** Analyser on the mic, for the listening lane. */
  micAnalyserRef?: RefObject<AnalyserNode | null>;
  /** Agent is generating a reply. */
  streaming: boolean;
  muted?: boolean;
  /** Backend is warming from a cold start. */
  waking?: boolean;
  /** Cue and mood events from the WebSocket. */
  cues?: CueBus;
  /** Playback position in ms. Cues schedule against this, not wall-clock time. */
  clockMs?: () => number;
  /** Which character to wear. Defaults to the neutral one. */
  character?: Character;
  size?: number;
}

export default function AgentFace({
  analyserRef, micAnalyserRef, streaming, muted, waking, cues, clockMs,
  character = DEFAULT_CHARACTER, size = 200,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const skinRef = useRef<Skin | null>(null);
  const musicRef = useRef<MusicDriver | null>(null);
  const musicCtxRef = useRef<AudioContext | null>(null);

  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [track, setTrack] = useState<{ name: string; analysis: MusicAnalysis } | null>(null);
  const reduced = useReducedMotion();

  // Remounted when the character changes, which is what swaps the face.
  const skin = useMemo(() => createSvgSkin(character), [character]);

  // --- mount the skin -------------------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    skin.mount(host);
    skinRef.current = skin;
    return () => {
      skin.unmount();
      skinRef.current = null;
    };
  }, [skin]);

  // --- stop the loop when nobody can see it ---------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let visible = !document.hidden;
    let onScreen = true;
    const sync = () => setPaused(!visible || !onScreen);

    const onVisibility = () => { visible = !document.hidden; sync(); };
    document.addEventListener('visibilitychange', onVisibility);

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    }, { threshold: 0.01 });
    io.observe(host);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      io.disconnect();
    };
  }, []);

  const controls = useFaceDriver({
    speakingAnalyser: analyserRef,
    micAnalyser: micAnalyserRef,
    skin: skinRef,
    streaming,
    muted,
    waking,
    motionScale: reduced ? 0 : 1,
    paused,
    music: musicRef,
    clockMs,
  });

  // --- dev diagnostics -------------------------------------------------------
  // The verification pass needs to watch the channels move against each other
  // -- particularly that `open` and `wide`/`round` are independent, which is
  // what separates a jaw/lip split from an amplitude-driven puppet. Stripped
  // from production builds by the DEV guard.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { faceDebug?: unknown }).faceDebug = {
      frame: () => ({ ...controls.state.current, ...controls.debug() }),
    };
    return () => { delete (window as unknown as { faceDebug?: unknown }).faceDebug; };
  }, [controls]);

  // --- cue stream ------------------------------------------------------------
  useEffect(() => {
    if (!cues) return;
    return cues.subscribe(
      (event) => controls.pushCue(event.tag, event.atMs),
      (mood) => controls.setMood(mood),
      (words) => controls.scheduleWords(words),
    );
  }, [cues, controls]);

  // --- music: drop a file on the face ----------------------------------------
  useEffect(() => () => {
    musicRef.current?.dispose();
    musicCtxRef.current?.close();
  }, []);

  async function handleFile(file: File) {
    if (!file.type.startsWith('audio/')) return;
    if (!musicCtxRef.current) musicCtxRef.current = new AudioContext();
    const ctx = musicCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();
    if (!musicRef.current) musicRef.current = createMusicDriver(ctx);

    const driver = musicRef.current;
    try {
      const analysis = await driver.loadFile(file);
      setTrack({ name: file.name, analysis });
      driver.play();
    } catch {
      setTrack(null);
    }
  }

  function stopMusic() {
    musicRef.current?.stop();
    setTrack(null);
  }

  return (
    <div
      className={`${styles.wrap} ${dragging ? styles.dragging : ''}`}
      style={{ width: size, height: size * 1.05 }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
    >
      <div ref={hostRef} className={styles.stage} />

      {dragging && <div className={styles.hint}>Drop audio to play</div>}

      {track && (
        <button className={styles.track} onClick={stopMusic} title="Stop playback">
          {track.name}
          {track.analysis.confidence >= 0.34 && track.analysis.bpm > 0
            ? ` · ${Math.round(track.analysis.bpm)} BPM`
            : ' · no clear beat'}
        </button>
      )}
    </div>
  );
}
