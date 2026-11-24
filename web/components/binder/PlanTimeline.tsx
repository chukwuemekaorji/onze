import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { planRows } from '../../report-view.js';
import { DealtCard } from '../report/DealtCard.js';
import { PaperCard } from '../ui/PaperCard.js';

interface PlanTimelineProps {
  summary: AnalysisSummary;
}

/** a few weeks' outlook as a plain timeline, under this week's advice */
export function PlanTimeline({ summary }: PlanTimelineProps) {
  const rows = planRows(summary.plan);
  if (rows.length === 0) return null;

  return (
    <DealtCard cardKey="transfer-plan" order={1} dealt={false}>
      <PaperCard as="section" className="report-card" aria-labelledby="plan-title">
        <h3 id="plan-title" className="plan-timeline__title">
          Looking ahead
        </h3>
        <p className="plan-timeline__lede">
          A {rows.length}-week outlook. This week's advice above is what onze
          recommends.
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
