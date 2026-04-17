import { useState } from 'react';
import type { VoiceMessage, ImageMessage } from '../../types';
import VoiceRecorder from '../inputs/VoiceRecorder';
import ImageUploader from '../inputs/ImageUploader';
import styles from './chat.module.css';

type ActivePanel = 'none' | 'voice' | 'image';

interface Props {
  onSendText: (text: string) => void;
  onSendVoice: (msg: VoiceMessage) => void;
  onSendImage: (msg: ImageMessage) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSendText, onSendVoice, onSendImage, disabled }: Props) {
  const [text, setText] = useState('');
  const [panel, setPanel] = useState<ActivePanel>('none');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendText(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={styles.inputArea}>
      {panel === 'voice' && (
        <VoiceRecorder
          onSend={(msg) => { onSendVoice(msg); setPanel('none'); }}
          onClose={() => setPanel('none')}
        />
      )}
      {panel === 'image' && (
        <ImageUploader
          onSend={(msg) => { onSendImage(msg); setPanel('none'); }}
          onClose={() => setPanel('none')}
        />
      )}
      <div className={styles.inputRow}>
        <button
          className={`${styles.toolBtn} ${panel === 'voice' ? styles.active : ''}`}
          onClick={() => setPanel(panel === 'voice' ? 'none' : 'voice')}
          title="Voice message"
          aria-label="Voice message"
        >
          🎙
        </button>
        <button
          className={`${styles.toolBtn} ${panel === 'image' ? styles.active : ''}`}
          onClick={() => setPanel(panel === 'image' ? 'none' : 'image')}
          title="Upload image"
          aria-label="Upload image"
        >
          🖼
        </button>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          disabled={disabled}
        />
        <button
          className={styles.sendBtn}
          onClick={submit}
          disabled={disabled || !text.trim()}
          aria-label="Send"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
