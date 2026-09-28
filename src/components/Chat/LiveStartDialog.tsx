import styles from './live-start-dialog.module.css';

interface Props {
  agentName: string;
  /** The voice backend is coming up from a cold start behind this dialog. */
  waking?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function LiveStartDialog({ agentName, waking, onConfirm, onCancel }: Props) {
  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.iconRow}>
          <span className={styles.micIcon}>🎙️</span>
        </div>
        <h2 className={styles.title}>Start live session?</h2>
        <p className={styles.body}>
          <strong>{agentName}</strong> is a live agent. Connecting will open a
          real-time audio channel and request microphone access.
        </p>
        {waking && (
          <p className={styles.waking} role="status" aria-live="polite">
            Warming up the voice…
          </p>
        )}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.confirmBtn} onClick={onConfirm}>Allow &amp; Start</button>
        </div>
      </div>
    </div>
  );
}
