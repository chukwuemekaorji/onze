import { captainOptions } from '../../report-view.js';
import { CoachNote } from '../report/CoachNote.js';
import { DealtCard } from '../report/DealtCard.js';
import { PaperCard } from '../ui/PaperCard.js';
import { BinderPage } from './BinderPage.js';
import { aiNote } from './page-props.js';
import type { BinderPageProps } from './page-props.js';

export function CaptaincyPage({ shown, focusTitle }: BinderPageProps) {
  const { summary } = shown;
  const options = captainOptions(summary.captaincy, summary.currentEvent);
  const note = aiNote(shown, 'captaincy');

  return (
    <BinderPage title="Captaincy" focusTitle={focusTitle} className="captaincy-page">
      <p className="page-lede">The best armband options in your lineup, ranked.</p>
      <DealtCard cardKey="captain-options" order={0} dealt={false}>
        <PaperCard as="section" className="report-card" aria-label="Captain options">
          {options.length === 0 ? (
            <p className="report-card__empty">No clear captain in this lineup.</p>
          ) : (
            <ol className="captain-ranks">
              {options.map((option) => (
                <li
                  key={option.id}
                  className={`captain-rank${option.role ? ` captain-rank--${option.role}` : ''}`}
                >
                  <span className="captain-rank__number" aria-hidden="true">
                    {option.rank}
                  </span>
                  <span className="captain-rank__badge">
                    {option.role && (
                      <span
                        className={`armband-badge armband-badge--${option.role}`}
                        role="img"
                        aria-label={
                          option.role === 'captain' ? 'Captain' : 'Vice-captain'
                        }
                      >
                        {option.role === 'captain' ? 'C' : 'V'}
                      </span>
                    )}
                  </span>
                  <span className="captain-rank__name">{option.name}</span>
                  <span className="captain-rank__fixture">{option.fixture}</span>
                  <span className="captain-rank__reason">{option.reason}</span>
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
