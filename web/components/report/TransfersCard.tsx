import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { formatGain, HIT_LABEL, transferMoves } from '../../report-view.js';
import { PaperCard } from '../ui/PaperCard.js';
import { CoachNote } from './CoachNote.js';

interface TransfersCardProps {
  transfers: AnalysisSummary['transfers'];
  /** ai prose for this section, or null for a basic report */
  note: string | null;
}

export function TransfersCard({ transfers, note }: TransfersCardProps) {
  const moves = transferMoves(transfers);
  const free = transfers.freeTransfers;

  return (
    <PaperCard
      as="section"
      className="report-card"
      tape
      aria-labelledby="transfers-heading"
    >
      <h3 id="transfers-heading" className="report-card__title">
        Transfers
      </h3>
      <p className="report-card__meta">
        {free} free transfer{free === 1 ? '' : 's'}
        {moves.length > 0 && ` · net ${formatGain(transfers.projectedNetGain)}`}
      </p>

      {moves.length === 0 ? (
        <p className="report-card__empty">
          No move is worth making this week. Roll the transfer.
        </p>
      ) : (
        <ol className="transfer-moves">
          {moves.map((move) => (
            <li key={move.outName} className="transfer-move">
              <span className="transfer-move__out">
                <span className="sr-only">Out: </span>
                <del>{move.outName}</del>
              </span>
              <svg
                className="transfer-move__arrow"
                viewBox="0 0 28 12"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M1 6.5 C 8 4.5, 16 7.5, 25 6 M20 1.8 L25.5 6 L20.5 10.4" />
              </svg>
              <span className="transfer-move__in">
                <span className="sr-only">In: </span>
                {move.inName ?? 'no affordable swap'}
              </span>
              {/* gain and tag wrap as one, so a tag never sits alone on a line */}
              <span className="transfer-move__cost">
                <span className="transfer-move__gain">{formatGain(move.gain)}</span>
                <span className={`transfer-move__tag transfer-move__tag--${move.cost}`}>
                  {move.cost === 'free' ? 'free' : HIT_LABEL}
                  {move.cost === 'hit' && <span className="sr-only"> points hit</span>}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {note !== null && <CoachNote text={note} />}
    </PaperCard>
  );
}
