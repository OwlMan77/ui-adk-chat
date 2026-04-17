import { useState } from 'react';

interface SessionEntry {
  key: string;
  value: string;
}

export function useSessionEntries() {
  const [entries, setEntries] = useState<SessionEntry[]>(() => {
    const stored: SessionEntry[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)!;
      stored.push({ key, value: sessionStorage.getItem(key) ?? '' });
    }
    return stored.length > 0 ? stored : [{ key: '', value: '' }];
  });

  const updateEntry = (index: number, field: 'key' | 'value', val: string) => {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: val } : e));
  };

  const removeEntry = (index: number) => {
    setEntries(prev => prev.length === 1 ? [{ key: '', value: '' }] : prev.filter((_, i) => i !== index));
  };

  const addEntry = () => {
    setEntries(prev => [...prev, { key: '', value: '' }]);
  };

  const commitToStorage = () => {
    const valid = entries.filter(e => e.key.trim());
    sessionStorage.clear();
    for (const { key, value } of valid) {
      sessionStorage.setItem(key.trim(), value);
    }
    return valid;
  };

  return { entries, updateEntry, removeEntry, addEntry, commitToStorage };
}
