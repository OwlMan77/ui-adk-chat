import type { ImageMessage as TImageMessage } from '../../types';
import styles from './messages.module.css';

interface Props {
  message: TImageMessage;
}

export default function ImageMessage({ message }: Props) {
  return (
    <div className={`${styles.bubble} ${styles[message.role]} ${styles.imageBubble}`}>
      <img src={message.imageUrl} alt={message.caption ?? 'uploaded image'} className={styles.uploadedImage} />
      {message.caption && <p className={styles.caption}>{message.caption}</p>}
    </div>
  );
}
