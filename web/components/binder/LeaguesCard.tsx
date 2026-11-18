import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { leagueRows } from '../../report-view.js';
import type { LeagueRow } from '../../report-view.js';
import { PaperCard } from '../ui/PaperCard.js';

interface LeaguesCardProps {
  standings: AnalysisSummary['leagueStandings'];
}

// the same pen arrow as the price alerts; down is this one turned over
const ARROW_PATH = 'M7 13 L7 2.5 M3 6.5 L7 2 L11 6.5';

function describeMovement(row: LeagueRow): string {
  const places = `${row.places} place${row.places === 1 ? '' : 's'}`;
  switch (row.movement) {
    case 'up':
      return `up ${places}`;
    case 'down':
      return `down ${places}`;
    case 'same':
      return 'no change';
    case 'new':
      return 'new';
  }
}

/** every mini-league, so the notes never have to pick one at random */
export function LeaguesCard({ standings }: LeaguesCardProps) {
  const rows = leagueRows(standings);

  return (
    <PaperCard as="section" className="report-card" aria-labelledby="leagues-heading">
      <h3 id="leagues-heading" className="report-card__title">
        Your leagues
      </h3>
      {rows.length === 0 ? (
        <p className="report-card__empty">You're not in any mini-leagues yet.</p>
      ) : (
        <ul className="league-rows">
          {rows.map((row) => (
            <li key={row.id} className={`league-row league-row--${row.movement}`}>
              <span className="league-row__name">{row.name}</span>
              <span className="league-row__position">{row.position}</span>
              <span className="league-row__movement">
                {(row.movement === 'up' || row.movement === 'down') && (
                  <svg
                    className="league-row__arrow"
                    viewBox="0 0 14 15"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d={ARROW_PATH} />
                  </svg>
                )}
                <span aria-hidden="true">
                  {row.movement === 'up' || row.movement === 'down'
                    ? row.places
                    : row.movement === 'same'
                      ? '='
                      : 'new'}
                </span>
                <span className="sr-only">{describeMovement(row)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PaperCard>
  );
}
