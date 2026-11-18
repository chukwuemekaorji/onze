import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCoachPanelOpen, storeCoachPanelOpen } from '../web/coach-panel-store.js';

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

describe('coach panel preference', () => {
  it('has no saved choice at first, so the layout picks its default', () => {
    stubLocalStorage();
    expect(loadCoachPanelOpen()).toBeNull();
  });

  it('remembers open and closed', () => {
    stubLocalStorage();
    storeCoachPanelOpen(false);
    expect(loadCoachPanelOpen()).toBe(false);
    storeCoachPanelOpen(true);
    expect(loadCoachPanelOpen()).toBe(true);
  });

  it('ignores a value it did not write', () => {
    const store = stubLocalStorage();
    store.set('sensei:coachPanel', 'sideways');
    expect(loadCoachPanelOpen()).toBeNull();
  });

  it('copes with blocked storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadCoachPanelOpen()).toBeNull();
    expect(() => storeCoachPanelOpen(true)).not.toThrow();
  });
});
