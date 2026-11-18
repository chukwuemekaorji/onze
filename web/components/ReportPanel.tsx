import type { CoachReport } from '../../lib/coach-prompt.js';
import { renderMarkdownLite } from '../markdown.js';
import type { ShownReport } from '../use-report-flow.js';
import { SquadList } from './SquadList.js';

const REPORT_SECTIONS: ReadonlyArray<[title: string, field: keyof CoachReport]> = [
  ['Summary', 'summary'],
  ['Transfer', 'transfers'],
  ['Captaincy', 'captaincy'],
  ['Formation', 'formation'],
  ['Chips', 'chips'],
  ['Price Alerts', 'priceAlerts'],
];

interface ReportPanelProps {
  shown: ShownReport;
  writing: boolean;
}

export function ReportPanel({ shown, writing }: ReportPanelProps) {
  const lineupImageUrl = `/api/lineup-image?managerId=${shown.managerId}&event=${shown.summary.currentEvent}`;

  return (
    <section className="panel report-panel">
      <div className="panel-header">
        <h2>Your Squad</h2>
      </div>
      <SquadList summary={shown.summary} />

      <p id="report-progress" className="report-label" role="status" hidden={!writing}>
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
        Basic report (no AI). Add an Anthropic API key above for an AI-written report
        and chat.
      </p>
      <div id="report" className="report">
        {REPORT_SECTIONS.map(([title, field]) => (
          <section key={field} className="report-section">
            <h3>{title}</h3>
            {/* model output only reaches the dom through renderMarkdownLite, which escapes first */}
            <p
              dangerouslySetInnerHTML={{
                __html: renderMarkdownLite(shown.report[field]),
              }}
            />
          </section>
        ))}
      </div>

      <div className="lineup-image-card">
        <img id="lineup-image" alt="Recommended starting lineup" src={lineupImageUrl} />
      </div>
    </section>
  );
}
