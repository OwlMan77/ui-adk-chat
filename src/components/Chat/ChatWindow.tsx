import { useEffect, useState } from 'react';
import { useADKSession } from '../../hooks/useADKSession';
import { useLiveSession } from '../../hooks/useLiveSession';
import { useWarmBackend } from '../../hooks/useWarmBackend';
import type { VoiceMessage, ImageMessage } from '../../types';
import BlinkingFace from '../BlinkingFace/BlinkingFace';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import LiveStartDialog from './LiveStartDialog';
import LiveCallView from './LiveCallView';
import styles from './chat.module.css';

interface Props {
  userId: string;
  appName: string;
  live?: boolean;
  initialMessage?: string;
  onChangeAgent: () => void;
  onThemeChange?: (name: string) => void;
}

export default function ChatWindow({ userId, appName, live = false, initialMessage, onChangeAgent, onThemeChange }: Props) {
  const [liveConfirmed, setLiveConfirmed] = useState(false);

  // The voice GPU scales to zero. Start waking it the moment a live agent is
  // selected — while the dialog is still on screen and the user is reading it
  // and granting mic access. That is several seconds of human time that would
  // otherwise be spent waiting for a cold start after they have said hello.
  //
  // Deliberately not gated on !liveConfirmed: someone who clicks straight
  // through arrives in the call before the GPU is up, and the face should show
  // that honestly rather than sitting silent.
  const waking = useWarmBackend(live);

  const adkSession = useADKSession(userId, appName, initialMessage, { onThemeChange, enabled: !live });
  const liveSession = useLiveSession(userId, appName, initialMessage, { onThemeChange, enabled: live && liveConfirmed });
  const { messages, streaming, error, sendText, sendVoiceMessage, sendImageMessage, clearMessages } =
    live ? liveSession : adkSession;

  const liveActive = live && liveConfirmed;

  useEffect(() => {
    document.title = appName;
    return () => { document.title = 'adk-chat'; };
  }, [appName]);

  const handleConfirmLive = () => {
    setLiveConfirmed(true);
  };

  const handleCancelLive = () => {
    onChangeAgent();
  };

  const handleSendText = (text: string) => {
    if (text.trim() === '/clear') { clearMessages(); return; }
    sendText(text);
  };

  if (liveActive) {
    return (
      <LiveCallView
        agentName={appName}
        analyserRef={liveSession.analyserRef}
        micAnalyserRef={liveSession.micAnalyserRef}
        cueBus={liveSession.cueBus}
        audioClockMs={liveSession.audioClockMs}
        muted={liveSession.muted}
        onToggleMute={liveSession.toggleMute}
        onEndCall={onChangeAgent}
        messages={liveSession.messages}
        streaming={liveSession.streaming}
        waking={waking}
      />
    );
  }

  return (
    <div className={styles.window}>
      {live && !liveConfirmed && (
        <LiveStartDialog
          agentName={appName}
          waking={waking}
          onConfirm={handleConfirmLive}
          onCancel={handleCancelLive}
        />
      )}

      <header className={styles.header}>
        <span className={styles.avatar}><BlinkingFace /></span>
        <div className={styles.headerInfo}>
          <div className={styles.agentName}>
            {appName}
            {live && <span className={styles.liveBadge}>LIVE</span>}
          </div>
          <div className={styles.status}>
            {streaming ? 'Typing…' : 'Online'}
          </div>
        </div>
        <button className={styles.changeAgentBtn} onClick={onChangeAgent} title="Switch agent">
          Switch agent
        </button>
      </header>

      <MessageList
        messages={messages}
        streaming={streaming}
        onSelectCarouselItem={(item) => {
          const label = item.actionLabel ?? item.content.split('\n').find(l => l.trim()) ?? item.id;
          sendText(`I selected: ${label}`, { hideUserBubble: true });
        }}
      />

      {error && <div className={styles.errorBar}>{error}</div>}

      <ChatInput
        onSendText={handleSendText}
        onSendVoice={(msg: VoiceMessage) => sendVoiceMessage(msg)}
        onSendImage={(msg: ImageMessage) => sendImageMessage(msg)}
        disabled={streaming}
      />
    </div>
  );
}
