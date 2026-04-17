import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CarouselMessage as TCarouselMessage } from '../../types';
import styles from './messages.module.css';

interface Props {
  message: TCarouselMessage;
  onSelect: (id: string) => void;
}

export default function CarouselMessage({ message, onSelect }: Props) {
  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = message.items;
  const item = items[index];
  const isSelected = selectedId === item.id;

  const handleSelect = () => {
    setSelectedId(item.id);
    onSelect(item.id);
  };

  return (
    <div className={styles.carouselWrapper}>
      <div className={styles.card}>
        {item.imageUrl && (
          <img src={item.imageUrl} alt="" className={styles.cardImage} />
        )}
        <div className={styles.cardBody}>
          <div className={styles.cardContent}>
            <Markdown remarkPlugins={[remarkGfm]}>{item.content}</Markdown>
          </div>
          {item.actionLabel && item.actionUrl && (
            <a
              href={item.actionUrl}
              target="_blank"
              rel="noreferrer"
              className={styles.cardAction}
            >
              {item.actionLabel}
            </a>
          )}
          {!isSelected && (
            <button className={styles.selectBtn} onClick={handleSelect}>
              Select
            </button>
          )}
        </div>

        {!selectedId && (
          <div className={styles.cardNav}>
            <button
              className={styles.navBtn}
              onClick={() => setIndex((i) => i - 1)}
              disabled={index === 0}
              aria-label="Previous"
            >
              ←
            </button>
            <span className={styles.navCounter}>{index + 1} / {items.length}</span>
            <button
              className={styles.navBtn}
              onClick={() => setIndex((i) => i + 1)}
              disabled={index === items.length - 1}
              aria-label="Next"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
