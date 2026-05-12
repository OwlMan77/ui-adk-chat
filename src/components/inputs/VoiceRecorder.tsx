import { useEffect, useRef } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import type { VoiceMessage } from '../../types';
import styles from './inputs.module.css';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

interface Props {
  onSend: (msg: VoiceMessage) => void;
  onClose: () => void;
}

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const SAMPLE_INTERVAL_MS = 60;

function WaveformCanvas({
  analyserRef,
  recording,
}: {
  analyserRef: React.RefObject<AnalyserNode | null>;
  recording: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samplesRef = useRef<number[]>([]);
  const rafRef = useRef<number>(0);
  const lastSampleRef = useRef<number>(0);

  const redraw = (canvas: HTMLCanvasElement, samples: number[]) => {
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const maxBars = Math.floor(w / (BAR_WIDTH + BAR_GAP));
    const visible = samples.slice(-maxBars);

    visible.forEach((amp, i) => {
      const barH = Math.max(3, amp * h * 0.9);
      const x = i * (BAR_WIDTH + BAR_GAP);
      const y = (h - barH) / 2;
      ctx.fillStyle = `rgba(99, 179, 237, ${0.45 + amp * 0.55})`;
      ctx.beginPath();
      ctx.roundRect(x, y, BAR_WIDTH, barH, BAR_WIDTH / 2);
      ctx.fill();
    });
  };

  // Sampling loop — only runs while recording
  useEffect(() => {
    if (!recording) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tick = (now: number) => {
      const analyser = analyserRef.current;
      if (analyser && now - lastSampleRef.current >= SAMPLE_INTERVAL_MS) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        // RMS amplitude
        const rms = Math.sqrt(data.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / data.length);
        samplesRef.current.push(Math.min(1, rms * 4));
        lastSampleRef.current = now;
        redraw(canvas, samplesRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [recording, analyserRef]);

  // Keep the waveform visible when stopped
  useEffect(() => {
    if (!recording && canvasRef.current && samplesRef.current.length > 0) {
      redraw(canvasRef.current, samplesRef.current);
    }
    if (!recording) samplesRef.current = [];
  }, [recording]);

  return <canvas ref={canvasRef} className={styles.waveform} width={200} height={48} />;
}

export default function VoiceRecorder({ onSend, onClose }: Props) {
  const { state, audioBlob, durationMs, analyserRef, start, stop, reset } = useVoiceRecorder();

  const handleSend = () => {
    if (!audioBlob) return;
    const url = URL.createObjectURL(audioBlob);
    onSend({
      id: uid(),
      role: 'user',
      type: 'voice',
      audioBlob,
      audioUrl: url,
      durationMs,
      timestamp: Date.now(),
    });
    reset();
    onClose();
  };

  return (
    <div className={styles.voicePanel}>
      {state === 'idle' && (
        <button className={`${styles.iconBtn} ${styles.record}`} onClick={start}>
          🎙 Record
        </button>
      )}

      {(state === 'recording' || state === 'stopped') && (
        <WaveformCanvas analyserRef={analyserRef} recording={state === 'recording'} />
      )}

      {state === 'recording' && (
        <button className={`${styles.iconBtn} ${styles.stop}`} onClick={stop}>
          ⏹ Stop
        </button>
      )}

      {state === 'stopped' && (
        <div className={styles.voiceActions}>
          <button className={styles.iconBtn} onClick={reset}>Discard</button>
          <button className={`${styles.iconBtn} ${styles.send}`} onClick={handleSend}>Send</button>
        </div>
      )}

      <button className={styles.closeBtn} onClick={onClose}>✕</button>
    </div>
  );
}
