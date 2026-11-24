import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { trackKeySaved } from '../analytics.js';
import { forgetKey, KeyStoreError, saveKey } from '../key-store.js';
import type { StoredKey } from '../key-store.js';
import { NO_STATUS } from '../status-line.js';
import type { StatusLine } from '../status-line.js';
import { DRAWER_FOCUS_ATTRIBUTE } from './ui/Drawer.js';

const VISIBLE_KEY_SUFFIX_LENGTH = 4;

const PERSISTENCE_LABEL: Record<StoredKey['persistence'], string> = {
  session: 'saved for this session',
  device: 'saved on this device',
};

interface KeySettingsProps {
  storedKey: StoredKey | null;
  onChange: (stored: StoredKey | null) => void;
}

export function KeySettings({ storedKey, onChange }: KeySettingsProps) {
  const [keyText, setKeyText] = useState('');
  const [remember, setRemember] = useState(false);
  const [message, setMessage] = useState<StatusLine>(NO_STATUS);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const forgetButtonRef = useRef<HTMLButtonElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const stored = saveKey(keyText, remember);
      // only that a key was saved and where; the key itself never leaves storage
      trackKeySaved(remember);
      // the entry row hides once a key is saved, so focus would be lost with it
      flushSync(() => {
        // don't leave the key sitting in the dom once it's stored
        setKeyText('');
        setMessage(NO_STATUS);
        onChange(stored);
      });
      forgetButtonRef.current?.focus();
    } catch (err) {
      if (!(err instanceof KeyStoreError)) throw err;
      setMessage({ message: err.message, isError: true });
    }
  }

  function handleForget(): void {
    forgetKey();
    // the input can only take focus once the entry row is rendered visible again
    flushSync(() => {
      setRemember(false);
      setMessage({
        message: 'Key forgotten. It has been removed from this browser.',
        isError: false,
      });
      onChange(null);
    });
    keyInputRef.current?.focus();
  }

  const savedLabel = storedKey
    ? `Key ending ${storedKey.key.slice(-VISIBLE_KEY_SUFFIX_LENGTH)}, ${PERSISTENCE_LABEL[storedKey.persistence]}.`
    : '';

  return (
    <form id="key-form" className="key-form" autoComplete="off" onSubmit={handleSubmit}>
      <label htmlFor="api-key">
        Anthropic API key <span className="label-hint">(optional)</span>
      </label>
      <p className="key-help">
        Adds an AI-written report and chat. Your key goes straight from this browser to
        Anthropic and never touches our server. Without one you get the same picks as
        short, plain notes, and no chat.
      </p>
      <div id="key-entry" hidden={storedKey !== null}>
        <div className="setup-row">
          <input
            ref={keyInputRef}
            id="api-key"
            {...{ [DRAWER_FOCUS_ATTRIBUTE]: true }}
            name="api-key"
            type="password"
            placeholder="sk-ant-..."
            autoComplete="off"
            spellCheck={false}
            value={keyText}
            onChange={(event) => setKeyText(event.target.value)}
          />
          <button type="submit">Save key</button>
        </div>
        <label className="checkbox-row" htmlFor="remember-key">
          <input
            id="remember-key"
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Remember on this device
        </label>
      </div>
      <div id="key-saved" className="key-saved" hidden={storedKey === null}>
        <span id="key-saved-label">{savedLabel}</span>
        <button
          ref={forgetButtonRef}
          id="forget-key-button"
          {...{ [DRAWER_FOCUS_ATTRIBUTE]: true }}
          className="ghost-button"
          type="button"
          onClick={handleForget}
        >
          Forget key
        </button>
      </div>
      <p
        id="key-message"
        className={message.isError ? 'key-message key-message--error' : 'key-message'}
        role="status"
      >
        {message.message}
      </p>
    </form>
  );
}
