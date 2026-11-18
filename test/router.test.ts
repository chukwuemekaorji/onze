import { describe, expect, it } from 'vitest';
import { HOME_ROUTE, routeFromPath, routePath, ROUTES } from '../web/router.js';

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

  it('looks up a path by route id', () => {
    expect(routePath('captaincy')).toBe('/app/captaincy');
  });
});
