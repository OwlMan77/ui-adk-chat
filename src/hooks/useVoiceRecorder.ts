import { useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'stopped';

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  const start = async () => {
    chunksRef.current = [];
    setAudioBlob(null);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setAudioBlob(blob);
      setDurationMs(Date.now() - startTimeRef.current);
      stream.getTracks().forEach((t) => t.stop());
    };

    startTimeRef.current = Date.now();
    recorder.start();
    setState('recording');
  };

  const stop = () => {
    mediaRecorderRef.current?.stop();
    setState('stopped');
  };

  const reset = () => {
    setAudioBlob(null);
    setDurationMs(0);
    setState('idle');
  };

  return { state, audioBlob, durationMs, start, stop, reset };
}
