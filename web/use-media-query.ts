import { useSyncExternalStore } from 'react';

/** whether a css media query matches, kept in step as the window changes */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

// the laptop layout: one screen, no page scroll, the coach docked on the right.
// mirrors the 1024px breakpoint in web/styles/workspace.css
export const LAPTOP_QUERY = '(min-width: 1024px)';
