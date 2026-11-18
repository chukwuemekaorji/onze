import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { captainPicks } from '../../report-view.js';
import { PaperCard } from '../ui/PaperCard.js';
import { CoachNote } from './CoachNote.js';

interface CaptaincyCardProps {
  captaincy: AnalysisSummary['captaincy'];
  event: number;
  note: string | null;
}

export function CaptaincyCard({ captaincy, event, note }: CaptaincyCardProps) {
  const picks = captainPicks(captaincy, event);

  return (
    <PaperCard as="section" className="report-card" aria-labelledby="captaincy-heading">
      <h3 id="captaincy-heading" className="report-card__title">
        Captaincy
      </h3>
      {picks.length === 0 ? (
        <p className="report-card__empty">No clear captain in this lineup.</p>
      ) : (
        <ul className="captain-picks">
          {picks.map((pick) => (
            <li key={pick.role} className="captain-pick">
              <span
                className={`armband-badge armband-badge--${pick.role}`}
                aria-label={pick.role === 'captain' ? 'Captain' : 'Vice-captain'}
                role="img"
              >
                {pick.role === 'captain' ? 'C' : 'V'}
              </span>
              <span className="captain-pick__name">{pick.name}</span>
              <span className="captain-pick__reason">{pick.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {note !== null && <CoachNote text={note} />}
    </PaperCard>
  );
}
