import { useEffect, useState } from 'react';

const ADK_BASE_URL = import.meta.env.VITE_ADK_BASE_URL ?? 'http://localhost:8000';

/**
 * Wake the speech backend before anyone needs it.
 *
 * The GPU serving the voice scales to zero, which is what makes it cost nothing
 * while nobody is talking to it and 5-20 seconds to answer when somebody starts.
 * Those seconds have to be spent somewhere. Spending them while the user is
 * reading the start dialog and granting microphone access is free; spending them
 * after they have said hello is the whole of the perceived latency.
 *
 * Fired on intent -- the moment a live agent is selected -- not on the first
 * word. Best effort in every direction: if it fails, the first reply simply
 * waits, which is what would have happened anyway.
 *
 * `enabled` is read at mount. It reflects which agent was chosen, which does
 * not change while this component is alive.
 */
export function useWarmBackend(enabled: boolean): boolean {
  const [warm, setWarm] = useState(!enabled);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    fetch(`${ADK_BASE_URL}/warm`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body) console.debug('[live] backend warm:', body);
      })
      .catch(() => { /* cold start, offline, no endpoint — all the same here */ })
      .finally(() => setWarm(true));

    return () => controller.abort();
  }, [enabled]);

  return enabled && !warm;
}
