import { useCallback, useId, useRef, useState } from 'react';
import { HOW_ONZE_PREDICTS, HOW_ONZE_PREDICTS_TITLE } from '../../lib/plain-labels.js';
import { useDismiss } from '../use-dismiss.js';
import type { DismissReason } from '../use-dismiss.js';
import { cx } from './ui/class-names.js';

interface HowOnzePredictsProps {
  className?: string;
}

/** "how does onze predict?": the same small pinned card as "where's my id?" */
export function HowOnzePredicts({ className }: HowOnzePredictsProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
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
        {HOW_ONZE_PREDICTS_TITLE}
      </button>
      <div
        id={panelId}
        className="id-help__panel"
        role="group"
        aria-label={HOW_ONZE_PREDICTS_TITLE}
        hidden={!open}
      >
        <p className="id-help__note">{HOW_ONZE_PREDICTS}</p>
      </div>
    </div>
  );
}
