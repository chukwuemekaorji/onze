import { DealtCard } from '../report/DealtCard.js';
import { BinderPage } from './BinderPage.js';
import { LeaguesCard } from './LeaguesCard.js';
import type { BinderPageProps } from './page-props.js';

export function LeaguesPage({ shown, focusTitle }: BinderPageProps) {
  return (
    <BinderPage title="Leagues" focusTitle={focusTitle} className="leagues-page">
      <p className="page-lede">
        Every mini-league you're in, with your rank and how it moved since last
        gameweek.
      </p>
      <DealtCard cardKey="your-leagues" order={0} dealt={false}>
        <LeaguesCard standings={shown.summary.leagueStandings} />
      </DealtCard>
    </BinderPage>
  );
}
