import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  forgetKey,
  isValidKeyFormat,
  KeyStoreError,
  loadKey,
  saveKey,
} from '../web/key-store.js';

const VALID_KEY = 'sk-ant-api03-test';

class FakeStorage {
  private readonly items = new Map<string, string>();
  getItem(name: string): string | null {
    return this.items.get(name) ?? null;
  }
  setItem(name: string, value: string): void {
    this.items.set(name, value);
  }
  removeItem(name: string): void {
    this.items.delete(name);
  }
  get size(): number {
    return this.items.size;
  }
}

class BlockedStorage {
  getItem(): never {
    throw new DOMException('blocked', 'SecurityError');
  }
  setItem(): never {
    throw new DOMException('blocked', 'SecurityError');
  }
  removeItem(): never {
    throw new DOMException('blocked', 'SecurityError');
  }
}

let session: FakeStorage;
let device: FakeStorage;

beforeEach(() => {
  session = new FakeStorage();
  device = new FakeStorage();
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('localStorage', device);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isValidKeyFormat', () => {
  it('accepts an anthropic key and rejects anything else', () => {
    expect(isValidKeyFormat(VALID_KEY)).toBe(true);
    expect(isValidKeyFormat('sk-ant-')).toBe(false);
    expect(isValidKeyFormat('sk-proj-openai')).toBe(false);
    expect(isValidKeyFormat('')).toBe(false);
  });
});

describe('key store', () => {
  it('returns null when no key is saved', () => {
    expect(loadKey()).toBeNull();
  });

  it('saves to session storage by default', () => {
    expect(saveKey(VALID_KEY, false)).toEqual({
      key: VALID_KEY,
      persistence: 'session',
    });
    expect(device.size).toBe(0);
    expect(loadKey()).toEqual({ key: VALID_KEY, persistence: 'session' });
  });

  it('saves to local storage when remember is ticked', () => {
    saveKey(VALID_KEY, true);

    expect(session.size).toBe(0);
    expect(loadKey()).toEqual({ key: VALID_KEY, persistence: 'device' });
  });

  it('keeps only one copy when switching modes', () => {
    saveKey(VALID_KEY, true);
    saveKey(VALID_KEY, false);

    expect(device.size).toBe(0);
    expect(loadKey()?.persistence).toBe('session');
  });

  it('trims whitespace from a pasted key', () => {
    expect(saveKey(`  ${VALID_KEY}\n`, false).key).toBe(VALID_KEY);
  });

  it('rejects a key in the wrong format without saving it', () => {
    expect(() => saveKey('sk-proj-openai', false)).toThrow(KeyStoreError);
    expect(loadKey()).toBeNull();
  });

  it('forgets the key from both storages', () => {
    saveKey(VALID_KEY, true);
    session.setItem('sensei:anthropicApiKey', VALID_KEY);

    forgetKey();

    expect(loadKey()).toBeNull();
  });

  it('survives blocked storage: load is null, save throws a clear error, forget is a no-op', () => {
    vi.stubGlobal('sessionStorage', new BlockedStorage());
    vi.stubGlobal('localStorage', new BlockedStorage());

    expect(loadKey()).toBeNull();
    expect(() => saveKey(VALID_KEY, false)).toThrow(/blocked saving the key/);
    expect(() => forgetKey()).not.toThrow();
  });
});
