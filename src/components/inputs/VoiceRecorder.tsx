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

export default function VoiceRecorder({ onSend, onClose }: Props) {
  const { state, audioBlob, durationMs, start, stop, reset } = useVoiceRecorder();

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
          🎙 Hold to record
        </button>
      )}
      {state === 'recording' && (
        <button className={`${styles.iconBtn} ${styles.stop}`} onClick={stop}>
          ⏹ Stop
        </button>
      )}
      {state === 'stopped' && (
        <div className={styles.voiceActions}>
          <button className={styles.iconBtn} onClick={reset}>Discard</button>
          <button className={`${styles.iconBtn} ${styles.send}`} onClick={handleSend}>
            Send
          </button>
        </div>
      )}
      <button className={styles.closeBtn} onClick={onClose}>✕</button>
    </div>
  );
}
