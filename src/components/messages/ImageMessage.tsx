import { useState, useEffect } from 'react';
import type { ImageMessage as TImageMessage } from '../../types';
import styles from './messages.module.css';

interface Props {
  message: TImageMessage;
}

export default function ImageMessage({ message }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <div className={`${styles.bubble} ${styles[message.role]} ${styles.imageBubble}`}>
        <img
          src={message.imageUrl}
          alt={message.caption ?? 'image'}
          className={styles.uploadedImage}
          onClick={() => setOpen(true)}
        />
        {message.caption && <p className={styles.caption}>{message.caption}</p>}
      </div>

      {open && (
        <div className={styles.lightboxOverlay} onClick={() => setOpen(false)}>
          <img
            src={message.imageUrl}
            alt={message.caption ?? 'image'}
            className={styles.lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
          <button className={styles.lightboxClose} onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>
      )}
    </>
  );
}
