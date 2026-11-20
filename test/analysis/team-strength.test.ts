import { describe, expect, it } from 'vitest';
import {
  TEAM_PRIOR_MATCHES,
  fixtureGoalRates,
  teamMatchesFrom,
  teamStrengths,
} from '../../lib/analysis/team-strength.js';
import type { TeamMatch, TeamRowFacts } from '../../lib/analysis/team-strength.js';

function match(
  teamName: string,
  expectedGoalsFor: number,
  expectedGoalsAgainst: number,
  wasHome = true,
): TeamMatch {
  return { teamName, wasHome, expectedGoalsFor, expectedGoalsAgainst };
}

// last season: league average 1.5 xg per team match, home 1.8, away 1.2
const LAST_SEASON: TeamMatch[] = [
  match('Arsenal', 2.4, 0.6, true),
  match('Arsenal', 1.8, 0.8, false),
  match('Spurs', 1.2, 1.8, true),
  match('Spurs', 0.6, 2.4, false),
  match('Luton', 1.8, 2.0, true),
  match('Luton', 1.2, 1.4, false),
];

describe('teamMatchesFrom', () => {
  it("sums each side's player xg per fixture and pairs it with the opponent's", () => {
    const rows: TeamRowFacts[] = [
      {
        fixtureId: 1,
        teamName: 'A',
        opponentTeamName: 'B',
        wasHome: true,
        expectedGoals: 0.5,
      },
      {
        fixtureId: 1,
        teamName: 'A',
        opponentTeamName: 'B',
        wasHome: true,
        expectedGoals: 0.7,
      },
      {
        fixtureId: 1,
        teamName: 'B',
        opponentTeamName: 'A',
        wasHome: false,
        expectedGoals: 0.3,
      },
    ];

    const matches = teamMatchesFrom(rows);

    expect(matches).toHaveLength(2);
    const home = matches.find((entry) => entry.teamName === 'A');
    expect(home?.expectedGoalsFor).toBeCloseTo(1.2);
    expect(home?.expectedGoalsAgainst).toBeCloseTo(0.3);
  });

  it('leaves out fixtures without xg instead of reading them as 0', () => {
    const rows: TeamRowFacts[] = [
      {
        fixtureId: 2,
        teamName: 'A',
        opponentTeamName: 'B',
        wasHome: true,
        expectedGoals: null,
      },
      {
        fixtureId: 2,
        teamName: 'B',
        opponentTeamName: 'A',
        wasHome: false,
        expectedGoals: null,
      },
    ];
    expect(teamMatchesFrom(rows)).toEqual([]);
  });
});

describe('teamStrengths', () => {
  it("blends this season with the team's own last season", () => {
    const strengths = teamStrengths([match('Arsenal', 3, 1)], LAST_SEASON);
    const arsenal = strengths.teams.get('Arsenal');

    expect(strengths.goalsPerTeamMatch).toBeCloseTo(1.5);
    expect(strengths.homeFactor).toBeCloseTo(1.2);
    expect(strengths.awayFactor).toBeCloseTo(0.8);
    // last season attack 2.1 per match, plus one match of 3
    expect(arsenal?.attack).toBeCloseTo(
      (3 + TEAM_PRIOR_MATCHES * 2.1) / (1 + TEAM_PRIOR_MATCHES),
    );
  });

  it("starts a promoted side from last season's weakest", () => {
    const strengths = teamStrengths([], LAST_SEASON);
    // with three teams, the weakest three are all of them
    expect(strengths.newcomer.attack).toBeCloseTo(1.5);
    expect(strengths.teams.get('Ipswich')).toBeUndefined();
  });

  it('fails loudly with no last season', () => {
    expect(() => teamStrengths([match('Arsenal', 1, 1)], [])).toThrow("last season's");
  });
});

describe('fixtureGoalRates', () => {
  it('is league average x attack x the opponent defence x home or away', () => {
    const strengths = teamStrengths([], LAST_SEASON);
    // spurs defence 2.1 against a 1.5 average, at home (1.2)
    const arsenalHome = fixtureGoalRates(strengths, 'Arsenal', 'Spurs', true);

    expect(arsenalHome.scoringMultiplier).toBeCloseTo((2.1 / 1.5) * 1.2);
    // spurs attack 0.9, away (0.8); arsenal defence 0.7
    expect(arsenalHome.opponentAttackMultiplier).toBeCloseTo((0.9 / 1.5) * 0.8);
    expect(arsenalHome.expectedGoalsAgainst).toBeCloseTo((0.9 / 1.5) * 0.8 * 0.7);
  });

  it('rates a team it has never seen as a promoted side', () => {
    const strengths = teamStrengths([], LAST_SEASON);
    const rates = fixtureGoalRates(strengths, 'Arsenal', 'Ipswich', true);
    expect(rates.scoringMultiplier).toBeCloseTo(
      (strengths.newcomer.defence / 1.5) * 1.2,
    );
  });
});
