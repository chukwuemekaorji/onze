// remembers whether the docked coach panel was left open or collapsed
const COACH_PANEL_STORAGE_KEY = 'sensei:coachPanel';

type CoachPanelState = 'open' | 'closed';

/** the saved choice, or null when there isn't one or storage is blocked */
export function loadCoachPanelOpen(): boolean | null {
  try {
    const saved = localStorage.getItem(COACH_PANEL_STORAGE_KEY);
    if (saved === 'open') return true;
    if (saved === 'closed') return false;
    return null;
  } catch {
    return null;
  }
}

export function storeCoachPanelOpen(open: boolean): void {
  const state: CoachPanelState = open ? 'open' : 'closed';
  try {
    localStorage.setItem(COACH_PANEL_STORAGE_KEY, state);
  } catch {
    // storage blocked; the choice lasts until the page closes
  }
}
