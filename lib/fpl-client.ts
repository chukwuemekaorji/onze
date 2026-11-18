import type {
  FplBootstrapStatic,
  FplFixture,
  FplEntry,
  FplEntryPicksResponse,
  FplEntryHistoryResponse,
  FplElementSummaryResponse,
} from './fpl-types.js';

const FPL_BASE_URL = 'https://fantasy.premierleague.com/api';

// bootstrap-static and fixtures are large and change rarely; everything
// else (entry/picks/history/element-summary) is manager- or gameweek-
// specific and cheap enough to fetch fresh each time.
const BOOTSTRAP_CACHE_TTL_MS = 10 * 60 * 1000;
const FIXTURES_CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

let bootstrapCache: CacheEntry<FplBootstrapStatic> | null = null;
let fixturesCache: CacheEntry<FplFixture[]> | null = null;

async function fplFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${FPL_BASE_URL}${path}`, {
    headers: {
      // FPL blocks requests with no User-Agent; be a polite, identifiable
      // consumer rather than looking like an anonymous scraper.
      'User-Agent': 'Sensei-FPL-Coach/1.0 (+https://github.com)',
    },
  });

  if (!response.ok) {
    throw new FplApiError(
      `FPL API request failed: ${path} returned ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export class FplApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'FplApiError';
  }
}

export async function getBootstrapStatic(): Promise<FplBootstrapStatic> {
  const now = Date.now();
  if (bootstrapCache && bootstrapCache.expiresAt > now) {
    return bootstrapCache.data;
  }

  const data = await fplFetch<FplBootstrapStatic>('/bootstrap-static/');
  bootstrapCache = { data, expiresAt: now + BOOTSTRAP_CACHE_TTL_MS };
  return data;
}

export async function getFixtures(): Promise<FplFixture[]> {
  const now = Date.now();
  if (fixturesCache && fixturesCache.expiresAt > now) {
    return fixturesCache.data;
  }

  const data = await fplFetch<FplFixture[]>('/fixtures/');
  fixturesCache = { data, expiresAt: now + FIXTURES_CACHE_TTL_MS };
  return data;
}

export async function getEntry(managerId: number): Promise<FplEntry> {
  return fplFetch<FplEntry>(`/entry/${managerId}/`);
}

export async function getEntryPicks(
  managerId: number,
  event: number,
): Promise<FplEntryPicksResponse> {
  return fplFetch<FplEntryPicksResponse>(
    `/entry/${managerId}/event/${event}/picks/`,
  );
}

export async function getEntryHistory(
  managerId: number,
): Promise<FplEntryHistoryResponse> {
  return fplFetch<FplEntryHistoryResponse>(`/entry/${managerId}/history/`);
}

export async function getElementSummary(
  playerId: number,
): Promise<FplElementSummaryResponse> {
  return fplFetch<FplElementSummaryResponse>(
    `/element-summary/${playerId}/`,
  );
}

/** Test-only hook to reset in-memory caches between test runs. */
export function __resetCachesForTests(): void {
  bootstrapCache = null;
  fixturesCache = null;
}
