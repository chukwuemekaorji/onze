import { useCallback, useId, useRef, useState } from 'react';
import { useDismiss } from '../use-dismiss.js';
import type { DismissReason } from '../use-dismiss.js';
import { cx } from './ui/class-names.js';

const FPL_SITE_URL = 'https://fantasy.premierleague.com';

interface FindMyIdHelpProps {
  className?: string;
}

/** "where's my id?": a disclosure button and a small pinned card of steps */
export function FindMyIdHelp({ className }: FindMyIdHelpProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback((reason: DismissReason) => {
    setOpen(false);
    // escape came from the keyboard, so hand focus back to where it started
    if (reason === 'escape') toggleRef.current?.focus();
  }, []);
  useDismiss(open, rootRef, dismiss);

  return (
    <div ref={rootRef} className={cx('id-help', className)}>
      <button
        ref={toggleRef}
        type="button"
        className="id-help__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Where's my ID?
      </button>
      <div
        id={panelId}
        className="id-help__panel"
        role="group"
        aria-labelledby={titleId}
        hidden={!open}
      >
        <p id={titleId} className="id-help__title">
          Finding your FPL ID
        </p>
        <ol className="id-help__steps">
          <li>
            Go to{' '}
            <a href={FPL_SITE_URL} target="_blank" rel="noopener noreferrer">
              fantasy.premierleague.com
            </a>{' '}
            and log in.
          </li>
          <li>
            Click the <strong>Points</strong> tab.
          </li>
          <li>
            Look at the address bar. It looks like{' '}
            <code className="id-help__url">
              fantasy.premierleague.com/entry/<mark>1234567</mark>/event/12
            </code>
            . The number after <code className="id-help__url">/entry/</code> is your ID.
          </li>
        </ol>
        <p className="id-help__note">
          On a phone? Same steps in your browser, not the FPL app.
        </p>
        <p className="id-help__paste">
          You can paste the whole address in. Onze picks out the number.
        </p>
      </div>
    </div>
  );
}
