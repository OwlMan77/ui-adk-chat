import { useEffect, useRef } from 'react';
import styles from './inputs.module.css';

const BAR_WIDTH = 2;
const BAR_GAP = 1;
const BAR_STEP = BAR_WIDTH + BAR_GAP;
const SAMPLE_INTERVAL_MS = 150;

interface Props {
  analyserRef: React.RefObject<AnalyserNode | null>;
  recording: boolean;
}

function redraw(canvas: HTMLCanvasElement, samples: number[]) {
  const dpr = window.devicePixelRatio ?? 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  const w = cssW * dpr;
  const h = cssH * dpr;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  if (!samples.length) return;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#3b82f6';
  ctx.save();
  ctx.scale(dpr, dpr);
  const maxBars = Math.floor(cssW / BAR_STEP);
  const visible = samples.slice(-maxBars);
  visible.forEach((amp, i) => {
    const barH = Math.max(3, amp * cssH * 0.9);
    const x = cssW - (visible.length - i) * BAR_STEP;
    const y = (cssH - barH) / 2;
    ctx.globalAlpha = 0.75 + amp * 0.25;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, BAR_WIDTH, barH);
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

export default function WaveformCanvas({ analyserRef, recording }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samplesRef = useRef<number[]>([]);
  const rafRef = useRef<number>(0);
  const lastSampleRef = useRef<number>(0);

  useEffect(() => {
    if (!recording) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    samplesRef.current = [];

    const tick = (now: number) => {
      const analyser = analyserRef.current;
      if (analyser && now - lastSampleRef.current >= SAMPLE_INTERVAL_MS) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || recording) return;
    redraw(canvas, samplesRef.current);
    samplesRef.current = [];
  }, [recording]);

  return <canvas ref={canvasRef} className={styles.waveform} />;
}
