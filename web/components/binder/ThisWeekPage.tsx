import { routePath } from '../../router.js';
import { captainSummaryLine, transferSummaryLine } from '../../report-view.js';
import { Pitch } from '../Pitch.js';
import { CoachNote } from '../report/CoachNote.js';
import { DealtCard } from '../report/DealtCard.js';
import { Notepad } from '../report/Notepad.js';
import { RouteLink } from '../RouteLink.js';
import { PaperCard } from '../ui/PaperCard.js';
import { BinderPage } from './BinderPage.js';
import { LeaguesCard } from './LeaguesCard.js';
import { aiNote } from './page-props.js';
import type { BinderPageProps } from './page-props.js';

/** the overview: the lineup, the coach's notes and the two moves that matter */
export function ThisWeekPage({ shown, focusTitle }: BinderPageProps) {
  const { summary } = shown;
  const formationNote = aiNote(shown, 'formation');

  return (
    <BinderPage title="This week" focusTitle={focusTitle} className="this-week">
      <div className="this-week__grid">
        <section className="this-week__pitch" aria-labelledby="pitch-heading">
          <h3 id="pitch-heading" className="this-week__pitch-title">
            Recommended XI
            {summary.lineup.formation && (
              <span className="this-week__formation">{summary.lineup.formation}</span>
            )}
          </h3>
          <Pitch summary={summary} />
          {formationNote !== null && <CoachNote text={formationNote} />}
        </section>

        <div className="this-week__column">
          <DealtCard cardKey="notepad" order={0}>
            <Notepad text={shown.report.summary} />
          </DealtCard>
          <DealtCard cardKey="your-moves" order={1}>
            <PaperCard
              as="section"
              className="report-card"
              aria-labelledby="moves-heading"
            >
              <h3 id="moves-heading" className="report-card__title">
                Your moves
              </h3>
              <dl className="moves-summary">
                <div className="moves-summary__row">
                  <dt>Transfers</dt>
                  <dd>
                    {transferSummaryLine(summary.transfers)}{' '}
                    <RouteLink to={routePath('transfers')} className="see-all">
                      See all<span className="sr-only"> transfers</span>
                    </RouteLink>
                  </dd>
                </div>
                <div className="moves-summary__row">
                  <dt>Captain</dt>
                  <dd>
                    {captainSummaryLine(summary.captaincy, summary.currentEvent)}{' '}
                    <RouteLink to={routePath('captaincy')} className="see-all">
                      See all<span className="sr-only"> captain options</span>
                    </RouteLink>
                  </dd>
                </div>
              </dl>
            </PaperCard>
          </DealtCard>
          <DealtCard cardKey="your-leagues" order={2}>
            <LeaguesCard standings={summary.leagueStandings} />
          </DealtCard>
        </div>
      </div>
    </BinderPage>
  );
}
