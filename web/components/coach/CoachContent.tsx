import type { ShownReport } from '../../use-report-flow.js';
import { ChatPanel } from '../ChatPanel.js';
import { CoachNote } from '../report/CoachNote.js';
import { DealtCard } from '../report/DealtCard.js';
import { Notepad } from '../report/Notepad.js';

interface CoachContentProps {
  shown: ShownReport;
  apiKey: string | null;
}

/** the coach's notes on top, the chat filling the rest */
export function CoachContent({ shown, apiKey }: CoachContentProps) {
  // the lineup reasoning moved here when this week became just the pitch
  const formationNote = shown.source === 'ai' ? shown.report.formation : null;

  return (
    <div className="coach-content">
      <div className="coach-content__notes">
        <DealtCard cardKey="notepad" order={0}>
          <Notepad text={shown.report.summary} />
        </DealtCard>
        {formationNote !== null && <CoachNote text={formationNote} />}
      </div>
      {/* keyed by report, so each new report starts a fresh conversation */}
      <ChatPanel key={shown.version} summary={shown.summary} apiKey={apiKey} />
    </div>
  );
}
