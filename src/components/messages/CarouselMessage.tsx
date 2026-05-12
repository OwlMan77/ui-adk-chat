import { useState, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CarouselMessage as TCarouselMessage, CarouselItem } from '../../types';
import styles from './messages.module.css';

const SWIPE_THRESHOLD = 50;

interface Props {
  message: TCarouselMessage;
  onSelect: (item: CarouselItem) => void;
}

export default function CarouselMessage({ message, onSelect }: Props) {
  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragStartX = useRef<number | null>(null);
  const items = message.items;
  const item = items[index];
  const isSelected = selectedId === item.id;

  const handleSelect = () => {
    setSelectedId(item.id);
    onSelect(item);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStartX.current === null || selectedId) return;
    const delta = e.clientX - dragStartX.current;
    dragStartX.current = null;
    if (delta < -SWIPE_THRESHOLD && index < items.length - 1) setIndex((i) => i + 1);
    else if (delta > SWIPE_THRESHOLD && index > 0) setIndex((i) => i - 1);
  };

  return (
    <div className={styles.carouselWrapper}>
      <div
        className={styles.card}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{ touchAction: 'pan-y' }}
      >
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
              onPointerDown={(e) => e.stopPropagation()}
            >
              {item.actionLabel}
            </a>
          )}
          {!isSelected && (
            <button className={styles.selectBtn} onPointerDown={(e) => e.stopPropagation()} onClick={handleSelect}>
              Select
            </button>
          )}
        </div>

        {!selectedId && (
          <div className={styles.cardNav}>
            <button
              className={styles.navBtn}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setIndex((i) => i - 1)}
              disabled={index === 0}
              aria-label="Previous"
            >
              ←
            </button>
            <span className={styles.navCounter}>{index + 1} / {items.length}</span>
            <button
              className={styles.navBtn}
              onPointerDown={(e) => e.stopPropagation()}
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
