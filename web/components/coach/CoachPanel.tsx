import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { loadCoachPanelOpen, storeCoachPanelOpen } from '../../coach-panel-store.js';
import type { ShownReport } from '../../use-report-flow.js';
import { CoachContent } from './CoachContent.js';
import { CoachIcon } from './CoachIcon.js';

const PANEL_BODY_ID = 'coach-panel-body';

interface CoachPanelProps {
  shown: ShownReport;
  apiKey: string | null;
}

/**
 * the coach docked on the right on a laptop. collapses to a slim rail; the
 * choice is remembered. the body stays mounted while collapsed, so a chat in
 * progress survives
 */
export function CoachPanel({ shown, apiKey }: CoachPanelProps) {
  const [open, setOpen] = useState(() => loadCoachPanelOpen() ?? true);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);

  // the pressed button is swapped for the other one, so focus follows it there
  function toggle(next: boolean): void {
    flushSync(() => setOpen(next));
    storeCoachPanelOpen(next);
    (next ? collapseRef : railRef).current?.focus();
  }

  return (
    <aside
      className={`coach-panel ${open ? 'coach-panel--open' : 'coach-panel--closed'}`}
      aria-labelledby="coach-panel-title"
    >
      {open ? (
        <div className="coach-panel__header">
          <h2 id="coach-panel-title" className="coach-panel__title">
            Coach
          </h2>
          <button
            ref={collapseRef}
            type="button"
            className="coach-panel__collapse"
            aria-expanded="true"
            aria-controls={PANEL_BODY_ID}
            aria-label="Collapse the coach panel"
            onClick={() => toggle(false)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          ref={railRef}
          type="button"
          className="coach-rail"
          aria-expanded="false"
          aria-controls={PANEL_BODY_ID}
          onClick={() => toggle(true)}
        >
          <CoachIcon />
          <span id="coach-panel-title" className="coach-rail__label">
            Coach
          </span>
        </button>
      )}
      <div id={PANEL_BODY_ID} className="coach-panel__body" hidden={!open}>
        <CoachContent shown={shown} apiKey={apiKey} />
      </div>
    </aside>
  );
}
