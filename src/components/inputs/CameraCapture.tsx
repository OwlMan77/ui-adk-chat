import { useRef, useEffect, useState } from 'react';
import type { ImageMessage } from '../../types';
import styles from './inputs.module.css';

function uid() { return Math.random().toString(36).slice(2, 10); }

interface Props {
  onSend: (msg: ImageMessage) => void;
  onClose: () => void;
}

export default function CameraCapture({ onSend, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startStream = () => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError('Camera access denied'));
  };

  useEffect(() => {
    startStream();
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    setCaptured(canvas.toDataURL('image/jpeg', 0.9));
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const retake = () => {
    setCaptured(null);
    startStream();
  };

  const send = () => {
    canvasRef.current?.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      onSend({ id: uid(), role: 'user', type: 'image', imageBlob: file, imageUrl: URL.createObjectURL(file), timestamp: Date.now() });
      onClose();
    }, 'image/jpeg', 0.9);
  };

  return (
    <div className={styles.cameraOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.cameraPanel}>
        {error ? (
          <p className={styles.cameraError}>{error}</p>
        ) : captured ? (
          <img src={captured} className={styles.cameraPreview} alt="Captured" />
        ) : (
          <video ref={videoRef} className={styles.cameraPreview} autoPlay playsInline muted />
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div className={styles.cameraActions}>
          <button className={styles.closeCameraBtn} onClick={onClose} aria-label="Close">✕</button>
          {!error && (captured ? (
            <>
              <button className={styles.retakeBtn} onClick={retake}>Retake</button>
              <button className={styles.sendCameraBtn} onClick={send}>Send</button>
            </>
          ) : (
            <button className={styles.captureBtn} onClick={capture} aria-label="Capture" />
          ))}
        </div>
      </div>
    </div>
  );
}
