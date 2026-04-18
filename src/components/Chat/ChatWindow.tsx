import { useEffect, useState } from 'react';
import { useADKSession } from '../../hooks/useADKSession';
import { useLiveSession } from '../../hooks/useLiveSession';
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
        muted={liveSession.muted}
        onToggleMute={liveSession.toggleMute}
        onEndCall={onChangeAgent}
      />
    );
  }

  return (
    <div className={styles.window}>
      {live && !liveConfirmed && (
        <LiveStartDialog
          agentName={appName}
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
        onSelectCarouselItem={(id) => sendText(id, { hideUserBubble: true })}
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
