import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import {
  isCacheStale,
  loadCachedReport,
  storeCachedReport,
} from '../web/report-cache.js';
import type { CachedReport } from '../web/report-cache.js';

const DEADLINE = '2026-11-21T11:00:00Z';
const ONE_HOUR_MS = 60 * 60 * 1000;

function makeCached(deadline: string): CachedReport {
  return {
    report: {
      summary: 's',
      transfers: 't',
      captaincy: 'c',
      chips: 'ch',
      priceAlerts: 'p',
      formation: 'f',
    },
    // only the deadline matters to the cache
    analysisSummary: { currentEventDeadline: deadline } as AnalysisSummary,
    source: 'basic',
    cachedAt: 0,
  };
}

function stubLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isCacheStale', () => {
  const deadlineMs = new Date(DEADLINE).getTime();

  it('keeps a report from before the deadline', () => {
    expect(isCacheStale(makeCached(DEADLINE), deadlineMs - ONE_HOUR_MS)).toBe(false);
  });

  it('drops a report once the deadline has passed', () => {
    expect(isCacheStale(makeCached(DEADLINE), deadlineMs + ONE_HOUR_MS)).toBe(true);
  });

  it('keeps a report whose deadline is missing or unreadable', () => {
    expect(isCacheStale(makeCached(''), deadlineMs)).toBe(false);
    expect(isCacheStale(makeCached('not a date'), deadlineMs)).toBe(false);
  });
});

describe('report cache storage', () => {
  it('round-trips a report per manager', () => {
    stubLocalStorage();
    const cached = makeCached(DEADLINE);

    storeCachedReport(42, cached);

    expect(loadCachedReport(42)).toEqual(cached);
    expect(loadCachedReport(43)).toBeNull();
  });

  it('ignores entries from older cache versions', () => {
    const store = stubLocalStorage();
    store.set('onze:report:42', JSON.stringify(makeCached(DEADLINE)));
    store.set('onze:report:v2:42', JSON.stringify(makeCached(DEADLINE)));

    expect(loadCachedReport(42)).toBeNull();
  });

  it('returns null for corrupt entries and blocked storage', () => {
    const store = stubLocalStorage();
    store.set('onze:report:v3:42', '{not json');
    expect(loadCachedReport(42)).toBeNull();

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadCachedReport(42)).toBeNull();
    expect(() => storeCachedReport(42, makeCached(DEADLINE))).not.toThrow();
  });
});
