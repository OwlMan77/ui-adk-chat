import styles from './blinking-face.module.css';

export default function BlinkingFace() {
  return (
    <svg
      className={styles.face}
      viewBox="0 0 40 40"
      width="1em"
      height="1em"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="18" className={styles.circle} />
      <rect x="11.75" y="13" width="2.5" height="12" rx="1.25" className={styles.eye} />
      <rect x="25.75" y="13" width="2.5" height="12" rx="1.25" className={styles.eye} />
    </svg>
  );
}
