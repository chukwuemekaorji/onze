import { describe, expect, it } from 'vitest';
import {
  canonicalPathFor,
  EXAMPLE_PATH,
  HOME_ROUTE,
  isLandingPath,
  routeFromPath,
  ROUTES,
  wantsExample,
} from '../web/router.js';

describe('routeFromPath', () => {
  it('maps each binder path to its route', () => {
    for (const route of ROUTES) {
      expect(routeFromPath(route.path)?.id).toBe(route.id);
    }
  });

  it('ignores a trailing slash', () => {
    expect(routeFromPath('/app/')?.id).toBe('week');
    expect(routeFromPath('/app/chips/')?.id).toBe('chips');
  });

  it('returns null for paths that are not binder pages', () => {
    expect(routeFromPath('/')).toBeNull();
    expect(routeFromPath('/app/nope')).toBeNull();
    expect(routeFromPath('/api/summary')).toBeNull();
    expect(routeFromPath('/apps')).toBeNull();
  });
});

describe('routes', () => {
  it('starts at this week on /app', () => {
    expect(HOME_ROUTE).toMatchObject({ id: 'week', path: '/app' });
  });

  it('keeps every page under /app, which vercel rewrites to the app', () => {
    for (const route of ROUTES) expect(route.path).toMatch(/^\/app(\/[a-z]+)?$/);
  });

  it('has a leagues page', () => {
    expect(routeFromPath('/app/leagues')?.label).toBe('Leagues');
  });
});

describe('canonicalPathFor', () => {
  it('leaves the landing page and every binder page alone', () => {
    expect(canonicalPathFor('/')).toBeNull();
    for (const route of ROUTES) expect(canonicalPathFor(route.path)).toBeNull();
    expect(canonicalPathFor('/app/chips/')).toBeNull();
  });

  it('sends an unknown /app path to /app and anything else to the landing page', () => {
    expect(canonicalPathFor('/app/nope')).toBe('/app');
    expect(canonicalPathFor('/pricing')).toBe('/');
    expect(canonicalPathFor('/apps')).toBe('/');
  });

  it('treats only "/" as the landing page', () => {
    expect(isLandingPath('/')).toBe(true);
    expect(isLandingPath('/app')).toBe(false);
  });
});

describe('example links', () => {
  it('opens the app with the example flag', () => {
    expect(EXAMPLE_PATH).toBe('/app?example');
    expect(wantsExample('?example')).toBe(true);
    expect(wantsExample('?example=1&utm=x')).toBe(true);
  });

  it('ignores other query strings', () => {
    expect(wantsExample('')).toBe(false);
    expect(wantsExample('?examples')).toBe(false);
  });
});
