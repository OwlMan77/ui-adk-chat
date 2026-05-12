import { useState, useRef } from 'react';
import type { VoiceMessage, ImageMessage } from '../../types';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import WaveformCanvas from '../inputs/WaveformCanvas';
import CameraCapture from '../inputs/CameraCapture';
import styles from './chat.module.css';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

interface Props {
  onSendText: (text: string) => void;
  onSendVoice: (msg: VoiceMessage) => void;
  onSendImage: (msg: ImageMessage) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSendText, onSendVoice, onSendImage, disabled }: Props) {
  const [text, setText] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { state: recState, audioBlob, durationMs, analyserRef, start, stop, reset } = useVoiceRecorder();

  const isRecording = recState === 'recording';
  const isStopped = recState === 'stopped';
  const hasText = text.trim().length > 0;

  const submitText = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendText(trimmed);
    setText('');
  };

  const submitVoice = () => {
    if (!audioBlob) return;
    const url = URL.createObjectURL(audioBlob);
    onSendVoice({
      id: uid(),
      role: 'user',
      type: 'voice',
      audioBlob,
      audioUrl: url,
      durationMs,
      timestamp: Date.now(),
    });
    reset();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitText();
    }
  };

  const handleRightBtn = () => {
    if (isRecording) { stop(); return; }
    if (isStopped) { submitVoice(); return; }
    if (hasText) { submitText(); return; }
    start();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onSendImage({ id: uid(), role: 'user', type: 'image', imageBlob: file, imageUrl: URL.createObjectURL(file), timestamp: Date.now() });
    e.target.value = '';
  };

  return (
    <div className={styles.inputArea}>
      {cameraOpen && (
        <CameraCapture onSend={(msg) => { onSendImage(msg); setCameraOpen(false); }} onClose={() => setCameraOpen(false)} />
      )}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

      <div className={styles.inputRow}>
        {/* Left button: discard when recording */}
        {(isRecording || isStopped) && (
          <button className={styles.discardBtn} onClick={reset} aria-label="Discard recording">✕</button>
        )}

        {/* Centre: textarea with paperclip inside, or waveform */}
        {isRecording || isStopped ? (
          <WaveformCanvas analyserRef={analyserRef} recording={isRecording} />
        ) : (
          <div className={styles.inputWrapper}>
            <div className={styles.inputActions}>
              <button className={styles.attachBtn} onClick={() => setCameraOpen(true)} title="Take photo" aria-label="Take photo" disabled={disabled}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </button>
              <button className={styles.attachBtn} onClick={() => fileInputRef.current?.click()} title="Upload image" aria-label="Upload image" disabled={disabled}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
            </div>
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message…"
              rows={1}
              disabled={disabled}
            />
          </div>
        )}

        {/* Right button: mic → stop → send */}
        <button
          className={`${styles.sendBtn} ${!isRecording && !isStopped && !hasText ? styles.micBtn : ''} ${isRecording ? styles.recordingBtn : ''}`}
          onClick={handleRightBtn}
          disabled={disabled}
          aria-label={isRecording ? 'Stop' : isStopped ? 'Send voice' : hasText ? 'Send' : 'Record'}
        >
          {isRecording ? '⏹' : isStopped || hasText ? '➤' : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
