import { useReportStage } from '../../report-stage.js';
import { formatGain, HIT_LABEL, hitAdvice, transferRows } from '../../report-view.js';
import { HOME_ROUTE, navigate } from '../../router.js';
import type { TransferVerdict } from '../../report-view.js';
import { CoachNote } from '../report/CoachNote.js';
import { DealtCard } from '../report/DealtCard.js';
import { PaperCard } from '../ui/PaperCard.js';
import { BinderPage } from './BinderPage.js';
import { PlayerCardDetails } from './PlayerCardDetails.js';
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
  const { requestSwap } = useReportStage();

  // the pitch lives on this week, so go there and let it play the swap
  function showOnPitch(incomingPlayerId: number | null): void {
    if (incomingPlayerId === null) return;
    requestSwap(incomingPlayerId);
    navigate(HOME_ROUTE.path);
  }

  const { transfers } = shown.summary;
  const rows = transferRows(transfers, shown.summary.currentEvent);
  const note = aiNote(shown, 'transfers');
  const free = transfers.freeTransfers;

  return (
    <BinderPage title="Transfers" focusTitle={focusTitle} className="transfers-page">
      <p className="page-lede">
        {free} free transfer{free === 1 ? '' : 's'}
        {transfers.recommendedCount > 0 &&
          ` · Onze predicts ${formatGain(transfers.projectedNetGain)} this week from the recommended moves`}
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
                  {row.sentence !== null && (
                    <p className="transfer-list__sentence">{row.sentence}</p>
                  )}
                  {row.incoming !== null && (
                    <PlayerCardDetails card={row.incoming} named />
                  )}
                  {row.alternatives.length > 0 && (
                    <p className="transfer-list__alternatives">
                      Alternatives: {row.alternatives.join(', ')}
                    </p>
                  )}
                  {row.verdict !== 'skip' && row.inId !== null && (
                    <button
                      type="button"
                      className="text-link transfer-list__show"
                      aria-label={`Show ${row.outName} out, ${row.inName ?? ''} in, on the pitch`}
                      onClick={() => showOnPitch(row.inId)}
                    >
                      Show on pitch
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {note !== null && <CoachNote text={note} />}
        </PaperCard>
      </DealtCard>
      {/* fpl's public api doesn't share selling prices, which only pay half of any rise */}
      <p className="budget-note">
        Budgets assume you sell at today's price. FPL only pays you half of any rise
        since you bought a player, so your real budget may be a little lower.
      </p>
    </BinderPage>
  );
}
