import { useSyncExternalStore } from 'react';

/** the binder's pages. each is a real url, so it can be linked and shared */

export type RouteId = 'week' | 'transfers' | 'captaincy' | 'chips' | 'prices';

export interface Route {
  id: RouteId;
  path: string;
  label: string;
}

export const ROUTES: readonly Route[] = [
  { id: 'week', path: '/app', label: 'This week' },
  { id: 'transfers', path: '/app/transfers', label: 'Transfers' },
  { id: 'captaincy', path: '/app/captaincy', label: 'Captaincy' },
  { id: 'chips', path: '/app/chips', label: 'Chips' },
  { id: 'prices', path: '/app/prices', label: 'Prices' },
];

export const HOME_ROUTE: Route = ROUTES[0] as Route;

export function routePath(id: RouteId): string {
  return ROUTES.find((route) => route.id === id)?.path ?? HOME_ROUTE.path;
}

// the custom event pushState doesn't fire, so in-app navigation can be heard
const NAVIGATE_EVENT = 'sensei:navigate';

// counts moves between pages since load (links, back and forward). a page that
// arrives by navigation takes focus; the one present on load doesn't
let navigations = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    navigations++;
  });
}

export function hasNavigated(): boolean {
  return navigations > 0;
}

/** the route for a pathname, ignoring a trailing slash; null when it isn't one */
export function routeFromPath(pathname: string): Route | null {
  const normalised = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ROUTES.find((route) => route.path === normalised) ?? null;
}

export const LANDING_PATH = '/';

// /app?example opens the bundled sample team instead of the user's own
const EXAMPLE_PARAM = 'example';
export const EXAMPLE_PATH = `${HOME_ROUTE.path}?${EXAMPLE_PARAM}`;

export function wantsExample(search: string): boolean {
  return new URLSearchParams(search).has(EXAMPLE_PARAM);
}

export function isLandingPath(pathname: string): boolean {
  return pathname === LANDING_PATH;
}

/**
 * where an unknown path should go, or null when it's already fine: the landing
 * page and the binder pages stay put, an unknown /app path goes to /app, and
 * anything else goes to the landing page
 */
export function canonicalPathFor(pathname: string): string | null {
  if (isLandingPath(pathname) || routeFromPath(pathname)) return null;
  return pathname.startsWith(`${HOME_ROUTE.path}/`) ? HOME_ROUTE.path : LANDING_PATH;
}

/** swaps an unknown path for its canonical one without adding a history entry */
export function canonicalisePath(): void {
  const target = canonicalPathFor(window.location.pathname);
  if (target === null) return;
  window.history.replaceState(null, '', target + window.location.search);
}

export function navigate(path: string): void {
  if (path === window.location.pathname) return;
  window.history.pushState(null, '', path);
  navigations++;
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

const currentPath = () => window.location.pathname;

/** the active route, re-rendering on back, forward and in-app links */
export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, currentPath);
  return routeFromPath(path) ?? HOME_ROUTE;
}
