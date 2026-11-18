import { formatGain, HIT_LABEL, hitAdvice, transferRows } from '../../report-view.js';
import type { TransferVerdict } from '../../report-view.js';
import { CoachNote } from '../report/CoachNote.js';
import { DealtCard } from '../report/DealtCard.js';
import { PaperCard } from '../ui/PaperCard.js';
import { BinderPage } from './BinderPage.js';
import { aiNote } from './page-props.js';
import type { BinderPageProps } from './page-props.js';

const VERDICT_LABEL: Record<TransferVerdict, string> = {
  free: 'free',
  hit: HIT_LABEL,
  skip: 'skip',
};

// read in full by screen readers, where "-4" or "skip" alone is unclear
const VERDICT_DESCRIPTION: Record<TransferVerdict, string> = {
  free: 'recommended, uses a free transfer',
  hit: 'recommended, costs a 4-point hit',
  skip: 'not worth making this week',
};

export function TransfersPage({ shown, focusTitle }: BinderPageProps) {
  const { transfers } = shown.summary;
  const rows = transferRows(transfers);
  const note = aiNote(shown, 'transfers');
  const free = transfers.freeTransfers;

  return (
    <BinderPage title="Transfers" focusTitle={focusTitle} className="transfers-page">
      <p className="page-lede">
        {free} free transfer{free === 1 ? '' : 's'}
        {transfers.recommendedCount > 0 &&
          ` · net ${formatGain(transfers.projectedNetGain)} from the recommended moves`}
      </p>
      <p className="hit-advice">{hitAdvice(shown.summary)}</p>

      <DealtCard cardKey="transfers-list" order={0} dealt={false}>
        <PaperCard
          as="section"
          className="report-card"
          aria-label="Transfer suggestions"
        >
          {rows.length === 0 ? (
            <p className="report-card__empty">No weak links in your squad this week.</p>
          ) : (
            <ol className="transfer-list">
              {rows.map((row) => (
                <li
                  key={row.outName}
                  className={`transfer-list__item transfer-list__item--${row.verdict}`}
                >
                  <div className="transfer-move">
                    <span className="transfer-move__out">
                      <span className="sr-only">Out: </span>
                      <del>{row.outName}</del>
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
                      {row.inName ?? 'no affordable swap'}
                    </span>
                    <span className="transfer-move__cost">
                      <span className="transfer-move__gain">
                        {formatGain(row.gain)}
                      </span>
                      <span
                        className={`transfer-move__tag transfer-move__tag--${row.verdict}`}
                      >
                        <span aria-hidden="true">{VERDICT_LABEL[row.verdict]}</span>
                        <span className="sr-only">
                          {VERDICT_DESCRIPTION[row.verdict]}
                        </span>
                      </span>
                    </span>
                  </div>
                  {row.alternatives.length > 0 && (
                    <p className="transfer-list__alternatives">
                      Alternatives: {row.alternatives.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {note !== null && <CoachNote text={note} />}
        </PaperCard>
      </DealtCard>
    </BinderPage>
  );
}
