import { useEffect, useState } from 'react';

// the countdown shows minutes, so a few seconds of lag is invisible and cheap
const DEFAULT_TICK_MS = 10_000;

/** the current time, refreshed every tick */
export function useNow(tickMs: number = DEFAULT_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);
  return now;
}
