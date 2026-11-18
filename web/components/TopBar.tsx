import type { RefObject } from 'react';
import type { AnalysisSummary } from '../../lib/analysis-summary.js';
import { DeadlineStamp } from './DeadlineStamp.js';
import { INK_WOBBLE_FILTER } from './ui/InkFilters.js';

interface TopBarProps {
  // null until the first report is shown
  summary: AnalysisSummary | null;
  busy: boolean;
  aiOn: boolean;
  keyDrawerId: string;
  keyDrawerOpen: boolean;
  aiPillRef: RefObject<HTMLButtonElement | null>;
  onRefresh: () => void;
  onChangeTeam: () => void;
  onOpenKeyDrawer: () => void;
}

export function TopBar({
  summary,
  busy,
  aiOn,
  keyDrawerId,
  keyDrawerOpen,
  aiPillRef,
  onRefresh,
  onChangeTeam,
  onOpenKeyDrawer,
}: TopBarProps) {
  return (
    <header className="masthead">
      <div className="masthead__brand">
        {/* a chalkboard play: a player, a marker and the run between them */}
        <svg
          className="masthead__mark"
          viewBox="0 0 32 32"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="8" cy="22" r="4.5" filter={INK_WOBBLE_FILTER} />
          <path d="M20 5 l7 7 M27 5 l-7 7" filter={INK_WOBBLE_FILTER} />
          <path
            className="masthead__mark-arrow"
            d="M11.5 18 C 14 12, 17 15, 21 13 M17.5 11.6 L21 13 L19.2 16.4"
            filter={INK_WOBBLE_FILTER}
          />
        </svg>
        <span className="masthead__wordmark">Sensei</span>
      </div>

      {summary && (
        <div className="masthead__gameweek">
          <h1 className="masthead__title">Gameweek {summary.currentEvent}</h1>
          <DeadlineStamp summary={summary} />
        </div>
      )}

      <div className="masthead__actions">
        {summary && (
          <>
            <button
              type="button"
              className="icon-button"
              aria-label="Refresh report"
              disabled={busy}
              onClick={onRefresh}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
                <path d="M19.8 3.8v4.4h-4.4" />
              </svg>
            </button>
            <button type="button" className="text-link" onClick={onChangeTeam}>
              Change team
            </button>
          </>
        )}
        <button
          ref={aiPillRef}
          type="button"
          className={`ai-pill ${aiOn ? 'ai-pill--on' : 'ai-pill--off'}`}
          aria-haspopup="dialog"
          aria-expanded={keyDrawerOpen}
          aria-controls={keyDrawerId}
          onClick={onOpenKeyDrawer}
        >
          <span className="ai-pill__dot" aria-hidden="true" />
          AI coaching: {aiOn ? 'on' : 'off'}
          {!aiOn && <span className="ai-pill__action">Add key</span>}
        </button>
      </div>
    </header>
  );
}
