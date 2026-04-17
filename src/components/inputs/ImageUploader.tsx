import { useRef } from 'react';
import type { ImageMessage } from '../../types';
import styles from './inputs.module.css';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

interface Props {
  onSend: (msg: ImageMessage) => void;
  onClose: () => void;
}

export default function ImageUploader({ onSend, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onSend({
      id: uid(),
      role: 'user',
      type: 'image',
      imageBlob: file,
      imageUrl: url,
      timestamp: Date.now(),
    });
    onClose();
  };

  return (
    <div className={styles.voicePanel}>
      <button className={styles.iconBtn} onClick={() => inputRef.current?.click()}>
        📎 Choose image
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button className={styles.closeBtn} onClick={onClose}>✕</button>
    </div>
  );
}
