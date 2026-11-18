import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { priceRows } from '../../report-view.js';
import { PaperCard } from '../ui/PaperCard.js';
import { CoachNote } from './CoachNote.js';

interface PriceAlertsCardProps {
  alerts: AnalysisSummary['priceAlerts']['alerts'];
  note: string | null;
}

// a quick pen arrow; the fall arrow is the same stroke flipped
const ARROW_PATH = 'M7 13 L7 2.5 M3 6.5 L7 2 L11 6.5';

export function PriceAlertsCard({ alerts, note }: PriceAlertsCardProps) {
  const rows = priceRows(alerts);

  return (
    <PaperCard as="section" className="report-card" aria-labelledby="prices-heading">
      <h3 id="prices-heading" className="report-card__title">
        Price alerts
      </h3>
      {rows.length === 0 ? (
        <p className="report-card__empty">No price moves expected in your squad.</p>
      ) : (
        <ul className="price-rows">
          {rows.map((row) => (
            <li key={row.id} className={`price-row price-row--${row.direction}`}>
              <svg
                className="price-row__marker"
                viewBox="0 0 14 15"
                aria-hidden="true"
                focusable="false"
              >
                <path d={ARROW_PATH} />
              </svg>
              <span className="price-row__name">{row.name}</span>
              <span className="price-row__price">{row.price}</span>
              <span className="price-row__note">{row.note}</span>
            </li>
          ))}
        </ul>
      )}
      {note !== null && <CoachNote text={note} />}
    </PaperCard>
  );
}
