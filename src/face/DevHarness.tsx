/** Dev-only harness for tuning the face. Gated behind import.meta.env.DEV in App.tsx. */
import { useEffect, useMemo, useRef, useState } from 'react';
import AgentFace from './AgentFace';
import { FACE_FFT_SIZE, FACE_SMOOTHING } from './audioFeatures';
import { createCueBus } from './cueBus';
import type { Mood } from './cues';

export default function DevHarness() {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const [on, setOn] = useState(false);
  const cues = useMemo(() => createCueBus(), []);
  const clockRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => () => {
    for (const t of timersRef.current) clearInterval(t);
    ctxRef.current?.close();
  }, []);

  async function startSynthetic() {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    await ctx.resume();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = FACE_FFT_SIZE;
    analyser.smoothingTimeConstant = FACE_SMOOTHING;
    analyserRef.current = analyser;

    // Synthetic "speech": a voiced carrier whose brightness and amplitude both
    // wobble, so the jaw and the lip shape should visibly move independently.
    //
    // The envelope below is not decoration. A constant drone is useless here:
    // audioFeatures keeps an adaptive noise floor, so a signal that never stops
    // trains the floor up to its own level and the gate correctly classifies it
    // as room noise -- the mouth then barely moves, and it looks like the rig is
    // broken when it is in fact doing its job. Real speech is syllabic bursts
    // separated by silences, so that is what gets scheduled.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 130;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.value = 700;

    const lfoF = ctx.createOscillator();
    lfoF.frequency.value = 0.7;
    const lfoFGain = ctx.createGain();
    lfoFGain.gain.value = 1200;
    lfoF.connect(lfoFGain).connect(filter.frequency);

    const amp = ctx.createGain();
    amp.gain.value = 0;

    osc.connect(filter).connect(amp).connect(analyser);
    // Silent sink: we only want the analyser to see it.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    analyser.connect(mute).connect(ctx.destination);

    // Schedule syllables ahead of the clock, a few seconds at a time. Irregular
    // lengths and gaps on purpose -- an even rhythm reads as a machine, and the
    // minimum-hold logic in mouth.ts only gets exercised by short ones.
    let at = ctx.currentTime + 0.05;
    function scheduleSyllables() {
      const until = ctx.currentTime + 4;
      while (at < until) {
        const len = 0.09 + Math.random() * 0.22;
        const peak = 0.18 + Math.random() * 0.5;
        amp.gain.setValueAtTime(0.0001, at);
        amp.gain.exponentialRampToValueAtTime(peak, at + 0.03);
        amp.gain.setValueAtTime(peak, at + len - 0.04);
        amp.gain.exponentialRampToValueAtTime(0.0001, at + len);
        // Vowel colour moves with each syllable, so `wide` and `round` have to
        // move independently of `open` -- the jaw/lip split this exists to show.
        filter.frequency.setValueAtTime(420 + Math.random() * 1500, at);
        // Most gaps are between syllables; occasionally a real pause, which is
        // what lets the noise floor settle back down.
        at += len + (Math.random() < 0.18 ? 0.35 + Math.random() * 0.5 : 0.05 + Math.random() * 0.1);
      }
    }
    scheduleSyllables();
    const timer = setInterval(scheduleSyllables, 2000);
    timersRef.current.push(timer);

    osc.start(); lfoF.start();
    setOn(true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 32 }}>
      <AgentFace
        analyserRef={analyserRef}
        streaming={on}
        cues={cues}
        clockMs={() => performance.now() - clockRef.current}
        size={260}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={startSynthetic}>start synthetic speech</button>
        {/* Speaking mode with no audio, so the word lane can be watched on its own. */}
        <button onClick={() => setOn((v) => !v)}>toggle speaking (silent)</button>
        {['laughter', 'sigh', 'question-en', 'surprise-ah', 'dissatisfaction-hnn'].map((t) => (
          <button key={t} onClick={() => cues.emit({ tag: t })}>{t}</button>
        ))}
        <button
          onClick={() => {
            // Simulates what the aligner returns: a sentence's worth of word
            // timings, arriving in one go, relative to where that sentence sits
            // in the playback stream. The mouth should start opening ~45 ms
            // before each word rather than after it.
            clockRef.current = performance.now();
            const words = 'The train leaves at a quarter past four'.split(' ');
            let t = 400;
            cues.emitWords(words.map((word) => {
              const dur = 90 + word.length * 45;
              const entry = { word, startMs: t, endMs: t + dur };
              t += dur + 70;
              return entry;
            }));
          }}
        >
          word timings
        </button>
        {(['neutral', 'warm', 'urgent', 'amused', 'concerned'] as Mood[]).map((m) => (
          <button key={m} onClick={() => cues.emitMood(m)}>mood: {m}</button>
        ))}
      </div>
    </div>
  );
}
