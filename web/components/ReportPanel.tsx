import type { ShownReport } from '../use-report-flow.js';
import { Pitch } from './Pitch.js';
import { CaptaincyCard } from './report/CaptaincyCard.js';
import { ChipsCard } from './report/ChipsCard.js';
import { CoachNote } from './report/CoachNote.js';
import { DealtCard } from './report/DealtCard.js';
import { Notepad } from './report/Notepad.js';
import { PriceAlertsCard } from './report/PriceAlertsCard.js';
import { TransfersCard } from './report/TransfersCard.js';

interface ReportPanelProps {
  shown: ShownReport;
  writing: boolean;
}

/** the pitch with the report column beside it, or under it on narrow screens */
export function ReportPanel({ shown, writing }: ReportPanelProps) {
  const { summary, report } = shown;
  // a basic report's section text just restates the cards, so only ai prose is shown
  const noteFor = (text: string) => (shown.source === 'ai' ? text : null);
  const formationNote = noteFor(report.formation);

  return (
    <div className="report-board">
      <section className="report-board__pitch" aria-labelledby="pitch-heading">
        <h2 id="pitch-heading" className="report-board__heading">
          Recommended XI
          {summary.lineup.formation && (
            <span className="report-board__formation">{summary.lineup.formation}</span>
          )}
        </h2>
        <Pitch summary={summary} />
        {formationNote !== null && <CoachNote text={formationNote} />}
      </section>

      <section className="report-board__column" aria-label="Coaching report">
        <p
          id="report-progress"
          className="report-label"
          role="status"
          hidden={!writing}
        >
          Sensei is writing your AI report...
        </p>
        <div
          id="report-banner"
          className="report-banner"
          role="alert"
          hidden={shown.errorMessage === null}
        >
          {shown.errorMessage}
        </div>
        <p id="report-label" className="report-label" hidden={shown.source !== 'basic'}>
          Basic report (no AI). Add an Anthropic API key with the AI coaching button at
          the top for the full write-up and chat.
        </p>

        <DealtCard order={0}>
          <Notepad text={report.summary} />
        </DealtCard>
        <DealtCard order={1}>
          <TransfersCard
            transfers={summary.transfers}
            note={noteFor(report.transfers)}
          />
        </DealtCard>
        <DealtCard order={2}>
          <CaptaincyCard
            captaincy={summary.captaincy}
            event={summary.currentEvent}
            note={noteFor(report.captaincy)}
          />
        </DealtCard>
        <DealtCard order={3}>
          <ChipsCard summary={summary} note={noteFor(report.chips)} />
        </DealtCard>
        <DealtCard order={4}>
          <PriceAlertsCard
            alerts={summary.priceAlerts.alerts}
            note={noteFor(report.priceAlerts)}
          />
        </DealtCard>
      </section>
    </div>
  );
}
