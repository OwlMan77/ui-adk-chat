import { useEffect, useRef } from 'react';
import type { ChatMessage, TextMessage } from '../../types';
import styles from './live-call.module.css';

interface Props {
  agentName: string;
  analyserRef: React.RefObject<AnalyserNode | null>;
  muted: boolean;
  onToggleMute: () => void;
  onEndCall: () => void;
  messages: ChatMessage[];
  streaming: boolean;
}

export default function LiveCallView({ agentName, muted, onToggleMute, onEndCall, messages, streaming }: Props) {
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const lastMsg = messages[messages.length - 1];
  const lastAgent = lastMsg?.role === 'agent' || streaming
    ? ([...messages].reverse().find((m) => m.role === 'agent') as TextMessage | undefined)
    : undefined;
  const lastUser = [...messages].reverse().find((m) => m.role === 'user') as TextMessage | undefined;

  return (
    <div className={styles.container}>
      <div className={styles.agentName}>{agentName}</div>

      <div className={styles.transcript} ref={transcriptRef}>
        {lastUser && (
          <div className={styles.transcriptUser}>{lastUser.text}</div>
        )}
        {lastAgent && (
          <div className={styles.transcriptAgent}>
            {lastAgent.text}
            {streaming && <span className={styles.cursor}>▋</span>}
          </div>
        )}
        {!lastUser && !lastAgent && (
          <div className={styles.transcriptPlaceholder}>Listening…</div>
        )}
      </div>

      <div className={styles.status}>
        {muted ? 'Microphone muted' : 'Listening…'}
      </div>

      <div className={styles.controls}>
        <button
          className={`${styles.btn} ${muted ? styles.btnMuted : styles.btnMic}`}
          onClick={onToggleMute}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            </svg>
          )}
        </button>

        <button
          className={`${styles.btn} ${styles.btnEnd}`}
          onClick={onEndCall}
          title="End call"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
