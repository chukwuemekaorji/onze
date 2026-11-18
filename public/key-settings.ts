import { forgetKey, KeyStoreError, loadKey, saveKey } from './key-store.js';
import type { StoredKey } from './key-store.js';

export const KEY_CHANGE_EVENT = 'sensei:keychange';

export type KeyChangeEvent = CustomEvent<StoredKey | null>;

const VISIBLE_KEY_SUFFIX_LENGTH = 4;

const PERSISTENCE_LABEL: Record<StoredKey['persistence'], string> = {
  session: 'saved for this session',
  device: 'saved on this device',
};

export function onKeyChange(listener: (key: StoredKey | null) => void): void {
  document.addEventListener(KEY_CHANGE_EVENT, (event) => {
    listener((event as KeyChangeEvent).detail);
  });
}

export function initKeySettings(): void {
  const keyForm = document.querySelector<HTMLFormElement>('#key-form')!;
  const keyEntryEl = document.querySelector<HTMLElement>('#key-entry')!;
  const keyInput = document.querySelector<HTMLInputElement>('#api-key')!;
  const rememberCheckbox = document.querySelector<HTMLInputElement>('#remember-key')!;
  const keySavedEl = document.querySelector<HTMLElement>('#key-saved')!;
  const keySavedLabelEl = document.querySelector<HTMLElement>('#key-saved-label')!;
  const forgetButton = document.querySelector<HTMLButtonElement>('#forget-key-button')!;
  const keyMessageEl = document.querySelector<HTMLElement>('#key-message')!;

  function setMessage(message: string, isError = false): void {
    keyMessageEl.textContent = message;
    keyMessageEl.classList.toggle('key-message--error', isError);
  }

  function render(stored: StoredKey | null): void {
    keyEntryEl.hidden = stored !== null;
    keySavedEl.hidden = stored === null;
    if (stored) {
      const suffix = stored.key.slice(-VISIBLE_KEY_SUFFIX_LENGTH);
      keySavedLabelEl.textContent = `Key ending ${suffix}, ${PERSISTENCE_LABEL[stored.persistence]}.`;
    }
  }

  function announce(stored: StoredKey | null): void {
    render(stored);
    document.dispatchEvent(new CustomEvent(KEY_CHANGE_EVENT, { detail: stored }));
  }

  keyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const stored = saveKey(keyInput.value, rememberCheckbox.checked);
      // don't leave the key sitting in the dom once it's stored
      keyInput.value = '';
      setMessage('');
      announce(stored);
    } catch (err) {
      if (!(err instanceof KeyStoreError)) throw err;
      setMessage(err.message, true);
    }
  });

  forgetButton.addEventListener('click', () => {
    forgetKey();
    rememberCheckbox.checked = false;
    setMessage('Key forgotten. It has been removed from this browser.');
    announce(null);
    keyInput.focus();
  });

  render(loadKey());
}
