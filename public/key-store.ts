const API_KEY_STORAGE_KEY = 'sensei:anthropicApiKey';
const ANTHROPIC_KEY_PREFIX = 'sk-ant-';

// session is the default so a shared computer forgets the key when the tab closes
export type KeyPersistence = 'session' | 'device';

export interface StoredKey {
  key: string;
  persistence: KeyPersistence;
}

export class KeyStoreError extends Error {}

export function isValidKeyFormat(key: string): boolean {
  return (
    key.startsWith(ANTHROPIC_KEY_PREFIX) && key.length > ANTHROPIC_KEY_PREFIX.length
  );
}

export function loadKey(): StoredKey | null {
  const sessionKey = readItem(() => sessionStorage);
  if (sessionKey) return { key: sessionKey, persistence: 'session' };

  const deviceKey = readItem(() => localStorage);
  if (deviceKey) return { key: deviceKey, persistence: 'device' };

  return null;
}

export function saveKey(rawKey: string, remember: boolean): StoredKey {
  const key = rawKey.trim();
  if (!isValidKeyFormat(key)) {
    throw new KeyStoreError(
      `That doesn't look like an Anthropic API key. It should start with "${ANTHROPIC_KEY_PREFIX}".`,
    );
  }

  const persistence: KeyPersistence = remember ? 'device' : 'session';
  try {
    const target = remember ? localStorage : sessionStorage;
    target.setItem(API_KEY_STORAGE_KEY, key);
  } catch {
    throw new KeyStoreError(
      'Your browser blocked saving the key. Allow site storage and try again.',
    );
  }

  // only one copy should ever exist, so switching modes clears the other
  removeItem(() => (remember ? sessionStorage : localStorage));
  return { key, persistence };
}

export function forgetKey(): void {
  removeItem(() => sessionStorage);
  removeItem(() => localStorage);
}

// storage access itself can throw (private mode, blocked site data), not just its methods
function readItem(getStorage: () => Storage): string | null {
  try {
    return getStorage().getItem(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function removeItem(getStorage: () => Storage): void {
  try {
    getStorage().removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // nothing stored there if it can't be accessed
  }
}
