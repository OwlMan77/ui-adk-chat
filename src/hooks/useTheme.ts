import { useState } from 'react';

export type ThemeName = 'dark' | 'light' | 'ocean' | 'sunset';

const VALID: ThemeName[] = ['dark', 'light', 'ocean', 'sunset'];
const STORAGE_KEY = 'adk-chat-theme';

function readStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (VALID as string[]).includes(stored)) {
      return stored as ThemeName;
    }
  } catch {
    // localStorage unavailable
  }
  return 'dark';
}

function applyTheme(name: ThemeName) {
  document.documentElement.setAttribute('data-theme', name);
}

// Apply theme immediately on module load to avoid flash
applyTheme(readStoredTheme());

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);

  const setTheme = (name: string) => {
    if (!(VALID as string[]).includes(name)) return;
    const validated = name as ThemeName;

    document.documentElement.classList.add('theme-transitioning');
    applyTheme(validated);

    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 650);

    try {
      localStorage.setItem(STORAGE_KEY, validated);
    } catch {
      // localStorage unavailable
    }

    setThemeState(validated);
  };

  return { theme, setTheme };
}
