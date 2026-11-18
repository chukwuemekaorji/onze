import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { chipStamps } from '../../report-view.js';
import { PaperCard } from '../ui/PaperCard.js';
import { CoachNote } from './CoachNote.js';

interface ChipsCardProps {
  summary: AnalysisSummary;
  note: string | null;
}

export function ChipsCard({ summary, note }: ChipsCardProps) {
  const stamps = chipStamps(summary.chipsUsed, summary.chips.suggestions);

  return (
    <PaperCard as="section" className="report-card" aria-labelledby="chips-heading">
      <h3 id="chips-heading" className="report-card__title">
        Your chips
      </h3>
      <ul className="chip-stamps">
        {stamps.map((stamp) => (
          <li key={stamp.chip} className={`chip-stamp chip-stamp--${stamp.state}`}>
            <span className="chip-stamp__name">{stamp.label}</span>
            <span className="chip-stamp__verdict">{stamp.verdict}</span>
          </li>
        ))}
      </ul>
      {note !== null && <CoachNote text={note} />}
    </PaperCard>
  );
}
