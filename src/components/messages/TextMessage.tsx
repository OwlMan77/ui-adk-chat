import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TextMessage as TTextMessage } from '../../types';
import styles from './messages.module.css';

interface Props {
  message: TTextMessage;
}

export default function TextMessage({ message }: Props) {
  return (
    <div className={`${styles.bubble} ${styles[message.role]}`}>
      <div className={styles.markdown}>
        <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
      </div>
    </div>
  );
}
