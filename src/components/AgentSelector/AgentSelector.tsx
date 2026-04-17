import { useEffect, useRef, useState } from 'react';
import { useSessionEntries } from '../../hooks/useSessionEntries';
import { listApps } from '../../services/adkClient';
import BlinkingFace from '../BlinkingFace/BlinkingFace';
import styles from './agent-selector.module.css';

interface Props {
  onSelect: (appName: string, starterMessage?: string) => void;
}

export default function AgentSelector({ onSelect }: Props) {
  const [apps, setApps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [starterMessage, setStarterMessage] = useState('');
  const { entries: sessionEntries, updateEntry, removeEntry, addEntry, commitToStorage } = useSessionEntries();
  const [starterOpen, setStarterOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listApps()
      .then(setApps)
      .catch((e) => setError(e instanceof TypeError && e.message === 'Failed to fetch' ? 'Unable to connect to services' : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const handleAgentChange = (appName: string) => {
    setSelectedApp(appName || null);
    setStarterMessage('');
    setStarterOpen(false);
    setSessionOpen(false);
  };

  const handleStart = () => {
    if (!selectedApp) return;

    const validEntries = commitToStorage();

    let message = starterMessage.trim();
    if (validEntries.length > 0) {
      const json = JSON.stringify(Object.fromEntries(validEntries.map(e => [e.key.trim(), e.value])));
      message = message ? `${message}\n\n${json}` : json;
    }

    onSelect(selectedApp, message || undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <span className={styles.logo}><BlinkingFace /></span>
        </div>
        <h1 className={styles.title}>Choose an agent</h1>
        <p className={styles.subtitle}>Select the agent you'd like to chat with.</p>

        {loading && <p className={styles.loadingText}>Loading agents…</p>}

        {error && <p className={styles.errorText}>{error}</p>}

        {!loading && !error && apps.length === 0 && (
          <p className={styles.errorText}>No agents found. Is the ADK server running?</p>
        )}

        {!loading && apps.length > 0 && (
          <div className={styles.selectWrapper}>
            <select
              className={styles.select}
              value={selectedApp ?? ''}
              onChange={(e) => handleAgentChange(e.target.value)}
            >
              <option value="" disabled>Select an agent…</option>
              {apps.map((appName) => (
                <option key={appName} value={appName}>{appName}</option>
              ))}
            </select>
            <span className={styles.selectChevron}>›</span>
          </div>
        )}

        <div className={`${styles.starterSection} ${selectedApp ? styles.starterVisible : ''}`}>
          <button
            className={styles.sectionToggle}
            onClick={() => setStarterOpen(!starterOpen)}
            aria-expanded={starterOpen}
          >
            <span>Initializing message <span className={styles.optional}>(optional)</span></span>
            <span className={`${styles.chevron} ${starterOpen ? styles.chevronOpen : ''}`}>›</span>
          </button>
          <div className={`${styles.sectionContent} ${starterOpen ? styles.sectionContentOpen : ''}`}>
            <textarea
              id="starter-msg"
              ref={textareaRef}
              className={styles.starterTextarea}
              placeholder="Send a first message when the chat opens…"
              value={starterMessage}
              onChange={(e) => setStarterMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
            />
          </div>

          <button
            className={styles.sectionToggle}
            onClick={() => setSessionOpen(!sessionOpen)}
            aria-expanded={sessionOpen}
          >
            <span>Session storage <span className={styles.optional}>(optional)</span></span>
            <span className={`${styles.chevron} ${sessionOpen ? styles.chevronOpen : ''}`}>›</span>
          </button>
          <div className={`${styles.sectionContent} ${sessionOpen ? styles.sectionContentOpen : ''}`}>
            <div className={styles.sessionRows}>
              {sessionEntries.map((entry, i) => (
                <div key={i} className={styles.sessionRow}>
                  <input
                    className={styles.sessionInput}
                    placeholder="key"
                    value={entry.key}
                    onChange={(e) => updateEntry(i, 'key', e.target.value)}
                  />
                  <input
                    className={styles.sessionInput}
                    placeholder="value"
                    value={entry.value}
                    onChange={(e) => updateEntry(i, 'value', e.target.value)}
                  />
                  <button
                    className={styles.sessionRemoveBtn}
                    onClick={() => removeEntry(i)}
                    aria-label="Remove entry"
                  >×</button>
                </div>
              ))}
              <button
                className={styles.sessionAddBtn}
                onClick={addEntry}
              >+ Add entry</button>
            </div>
          </div>

          <div className={styles.starterActions}>
            <button className={styles.backBtn} onClick={() => setSelectedApp(null)}>
              ← Back
            </button>
            <button className={styles.startBtn} onClick={handleStart}>
              Start chat →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
