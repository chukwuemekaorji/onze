import type { RefObject } from 'react';
import type { AnalysisSummary } from '../../lib/analysis-summary.js';
import { DeadlineStamp } from './DeadlineStamp.js';
import { LANDING_PATH } from '../router.js';
import { BrandMark } from './BrandMark.js';

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
      {/* the wordmark leads back to the landing page, like most sites */}
      <a href={LANDING_PATH} className="masthead__brand">
        <BrandMark className="masthead__mark" />
        <span className="masthead__wordmark">Onze</span>
      </a>

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
