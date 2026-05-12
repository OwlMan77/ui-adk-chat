import { useEffect, useRef } from 'react';

interface Props {
  analyserRef: React.RefObject<AnalyserNode | null>;
  streaming: boolean;
  size?: number;
}

const BASE = 40;

export default function AgentVisualizer({ analyserRef, streaming, size = 160 }: Props) {
  const leftBarRef = useRef<SVGRectElement>(null);
  const rightBarRef = useRef<SVGRectElement>(null);
  const rafRef = useRef<number>(0);

  const scale = size / BASE;
  const cx = size / 2;
  const cy = size / 2;
  const rInner = 18 * scale;
  const strokeW = 1 * scale;
  const barW = 2.5 * scale;
  const barRx = 1.25 * scale;
  const leftX = 11.75 * scale;
  const rightX = 25.75 * scale;
  const minH = 2 * scale;
  const maxH = 30 * scale;

  useEffect(() => {
    let phase = 0;
    const data = analyserRef.current ? new Uint8Array(analyserRef.current.frequencyBinCount) : null;

    function setBar(el: SVGRectElement | null, h: number) {
      if (!el) return;
      el.setAttribute('y', String(cy - h / 2));
      el.setAttribute('height', String(h));
    }

    function animate() {
      rafRef.current = requestAnimationFrame(animate);
      phase += 0.04;

      const analyser = analyserRef.current;
      let level = 0;

      if (analyser && data) {
        analyser.getByteFrequencyData(data);
        const slice = Math.max(1, Math.floor(data.length / 4));
        let sum = 0;
        for (let i = 0; i < slice; i++) sum += data[i];
        level = sum / slice / 255;
      }

      const range = maxH - minH;

      if (level > 0.04) {
        setBar(leftBarRef.current, minH + level * range * (0.6 + 0.4 * Math.abs(Math.sin(phase * 3))));
        setBar(rightBarRef.current, minH + level * range * (0.6 + 0.4 * Math.abs(Math.cos(phase * 3))));
      } else {
        const t = Math.sin(phase * 0.6) * 0.5 + 0.5;
        const h = minH + (t * 0.25 + 0.1) * range;
        setBar(leftBarRef.current, h);
        setBar(rightBarRef.current, h * (0.85 + 0.15 * Math.sin(phase * 0.4)));
      }
    }

    animate();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserRef, cy, minH, maxH]);

  const initH = 12 * scale;
  const initY = cy - initH / 2;
  const barColor = streaming ? '#63b3ed' : '#e2e8f0';

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={size / 2} fill="#0f172a" />
      <circle cx={cx} cy={cy} r={rInner} fill="transparent" stroke="#e2e8f0" strokeWidth={strokeW} />
      <rect ref={leftBarRef} x={leftX} y={initY} width={barW} height={initH} rx={barRx} fill={barColor} />
      <rect ref={rightBarRef} x={rightX} y={initY} width={barW} height={initH} rx={barRx} fill={barColor} />
    </svg>
  );
}
