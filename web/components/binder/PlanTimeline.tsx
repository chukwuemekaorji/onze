import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { planDiffersThisWeek, planRows } from '../../report-view.js';
import { DealtCard } from '../report/DealtCard.js';
import { PaperCard } from '../ui/PaperCard.js';

interface PlanTimelineProps {
  summary: AnalysisSummary;
}

/** the next few weeks' transfers as a plain timeline, under this week's advice */
export function PlanTimeline({ summary }: PlanTimelineProps) {
  const rows = planRows(summary.plan);
  if (rows.length === 0) return null;
  const differs = planDiffersThisWeek(summary);

  return (
    <DealtCard cardKey="transfer-plan" order={1} dealt={false}>
      <PaperCard as="section" className="report-card" aria-labelledby="plan-title">
        <h3 id="plan-title" className="plan-timeline__title">
          The next {rows.length} weeks
        </h3>
        <p className="plan-timeline__lede">
          Onze plans your transfers {rows.length} weeks ahead, counting later weeks a
          little less because they're harder to predict.
          {differs &&
            ' Looking that far ahead, it would do this week differently from the advice above.'}
        </p>
        <ol className="plan-timeline">
          {rows.map((row) => (
            <li
              key={row.event}
              className={`plan-timeline__week${row.hasHit ? ' plan-timeline__week--hit' : ''}`}
            >
              <p className="plan-timeline__headline">{row.headline}</p>
              <p className="plan-timeline__reason">{row.reason}</p>
            </li>
          ))}
        </ol>
      </PaperCard>
    </DealtCard>
  );
}
