import { gameweekTimeline } from '../../report-view.js';
import { ChipsCard } from '../report/ChipsCard.js';
import { DealtCard } from '../report/DealtCard.js';
import { PaperCard } from '../ui/PaperCard.js';
import { BinderPage } from './BinderPage.js';
import { aiNote } from './page-props.js';
import type { BinderPageProps } from './page-props.js';

const players = (count: number) => `${count} player${count === 1 ? '' : 's'}`;

export function ChipsPage({ shown, focusTitle }: BinderPageProps) {
  const { summary } = shown;
  const timeline = gameweekTimeline(summary);

  return (
    <BinderPage title="Chips" focusTitle={focusTitle} className="chips-page">
      <DealtCard cardKey="chip-stamps" order={0} dealt={false}>
        <ChipsCard summary={summary} note={aiNote(shown, 'chips')} />
      </DealtCard>

      <DealtCard cardKey="chip-timeline" order={1} dealt={false}>
        <PaperCard
          as="section"
          className="report-card"
          aria-labelledby="timeline-heading"
        >
          <h3 id="timeline-heading" className="report-card__title">
            Next {timeline.length} gameweeks
          </h3>
          <p className="report-card__meta">doubles and blanks that touch your squad</p>
          <ol className="gw-timeline">
            {timeline.map((gw) => {
              const quiet = gw.doublePlayers === 0 && gw.blankPlayers === 0;
              return (
                <li
                  key={gw.event}
                  className={`gw-timeline__week${quiet ? ' gw-timeline__week--quiet' : ''}`}
                >
                  <span className="gw-timeline__event">GW{gw.event}</span>
                  {gw.doublePlayers > 0 && (
                    <span className="gw-mark gw-mark--double">
                      Double · {players(gw.doublePlayers)}
                    </span>
                  )}
                  {gw.blankPlayers > 0 && (
                    <span className="gw-mark gw-mark--blank">
                      Blank · {players(gw.blankPlayers)}
                    </span>
                  )}
                  {quiet && (
                    <span className="gw-mark gw-mark--normal">Normal week</span>
                  )}
                </li>
              );
            })}
          </ol>
        </PaperCard>
      </DealtCard>
    </BinderPage>
  );
}
