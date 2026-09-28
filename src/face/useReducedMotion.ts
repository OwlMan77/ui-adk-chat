import { useEffect, useState } from 'react';

/**
 * Read prefers-reduced-motion in JS, not only in CSS, because the face is
 * animated imperatively. Subscribed, not sampled once: people change this
 * setting mid-session, often precisely because something started moving.
 *
 * The face is reduced, never hidden -- hiding it would remove the "is it
 * speaking?" affordance for everyone who relies on it.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
