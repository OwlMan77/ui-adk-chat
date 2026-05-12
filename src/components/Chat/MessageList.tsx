import { useEffect, useRef } from 'react';
import type { ChatMessage, CarouselItem } from '../../types';
import TextMessage from '../messages/TextMessage';
import CarouselMessage from '../messages/CarouselMessage';
import VoiceMessage from '../messages/VoiceMessage';
import ImageMessage from '../messages/ImageMessage';
import styles from './chat.module.css';

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  onSelectCarouselItem: (item: CarouselItem) => void;
}

export default function MessageList({ messages, streaming, onSelectCarouselItem }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={styles.messageList}>
      {messages.map((msg) => {
        switch (msg.type) {
          case 'text':
            return <TextMessage key={msg.id} message={msg} />;
          case 'carousel':
            return <CarouselMessage key={msg.id} message={msg} onSelect={onSelectCarouselItem} />;
          case 'voice':
            return <VoiceMessage key={msg.id} message={msg} />;
          case 'image':
            return <ImageMessage key={msg.id} message={msg} />;
        }
      })}
      {streaming && (
        <div className={styles.typingIndicator}>
          <span /><span /><span />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
