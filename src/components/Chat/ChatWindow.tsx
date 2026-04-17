import { useEffect } from 'react';
import { useADKSession } from '../../hooks/useADKSession';
import type { VoiceMessage, ImageMessage } from '../../types';
import BlinkingFace from '../BlinkingFace/BlinkingFace';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import styles from './chat.module.css';

interface Props {
  userId: string;
  appName: string;
  initialMessage?: string;
  onChangeAgent: () => void;
  onThemeChange?: (name: string) => void;
}

export default function ChatWindow({ userId, appName, initialMessage, onChangeAgent, onThemeChange }: Props) {
  const { messages, streaming, error, sendText, sendVoiceMessage, sendImageMessage, clearMessages } =
    useADKSession(userId, appName, initialMessage, { onThemeChange });

  useEffect(() => {
    document.title = appName;
    return () => { document.title = 'adk-chat'; };
  }, [appName]);

  const handleSendText = (text: string) => {
    if (text.trim() === '/clear') { clearMessages(); return; }
    sendText(text);
  };

  const handleVoice = (msg: VoiceMessage) => { sendVoiceMessage(msg); };
  const handleImage = (msg: ImageMessage) => { sendImageMessage(msg); };

  return (
    <div className={styles.window}>
      <header className={styles.header}>
        <span className={styles.avatar}><BlinkingFace /></span>
        <div className={styles.headerInfo}>
          <div className={styles.agentName}>{appName}</div>
          <div className={styles.status}>{streaming ? 'Typing…' : 'Online'}</div>
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
        onSendVoice={handleVoice}
        onSendImage={handleImage}
        disabled={streaming}
      />
    </div>
  );
}
