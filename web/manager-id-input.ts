import { parseManagerId } from './manager-id-store.js';

// fpl's points page lives at /entry/<id>/event/<gameweek>, and other team
// pages at /entry/<id>/history and so on. people paste the whole link
const ENTRY_PATH = /\/entry\/(\d+)(?=[/?#]|$)/;
const DIGITS_ONLY = /^\d+$/;

export const INVALID_MANAGER_ID_MESSAGE =
  'That isn\'t an FPL ID or an FPL team link. Tap "Where\'s my ID?" to find yours.';

/** the id in a typed number or a pasted fpl link, or null if it is neither */
export function managerIdFromInput(raw: string): number | null {
  const trimmed = raw.trim();
  const digits =
    ENTRY_PATH.exec(trimmed)?.[1] ?? (DIGITS_ONLY.test(trimmed) ? trimmed : null);
  return digits === null ? null : parseManagerId(digits);
}

/**
 * what the field shows after a change: a pasted link collapses to its id, so
 * people can see what will be sent. anything else is left as typed
 */
export function tidyManagerIdInput(raw: string): string {
  return ENTRY_PATH.exec(raw.trim())?.[1] ?? raw;
}
