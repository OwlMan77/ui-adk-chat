import { useEffect, useRef, useState } from 'react';
import type { VoiceMessage as TVoiceMessage } from '../../types';
import styles from './messages.module.css';

interface Props {
  message: TVoiceMessage;
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function VoiceMessage({ message }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(message.audioUrl ?? null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (message.audioBlob && !message.audioUrl) {
      const blobUrl = URL.createObjectURL(message.audioBlob);
      setUrl(blobUrl);
      return () => URL.revokeObjectURL(blobUrl);
    }
  }, [message.audioBlob, message.audioUrl]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className={`${styles.bubble} ${styles[message.role]} ${styles.voiceBubble}`}>
      <button className={styles.playBtn} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '⏸' : '▶'}
      </button>
      {message.durationMs && (
        <span className={styles.duration}>{formatMs(message.durationMs)}</span>
      )}
      {message.transcript && (
        <p className={styles.transcript}>{message.transcript}</p>
      )}
      {url && (
        <audio
          ref={audioRef}
          src={url}
          onEnded={() => setPlaying(false)}
          style={{ display: 'none' }}
        />
      )}
    </div>
  );
}
