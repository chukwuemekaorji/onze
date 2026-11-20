import {
  BONUS_FEATURES,
  FULL_GAME_FEATURES,
  bonusFeatures,
  eventLeaguePriorFrom,
  eventRatesPer90,
  expectedGoalsPer90,
  finishing,
  finishingEvidence,
  fullGameFeatures,
  playerRates,
  projectEvents,
  summariseEventSeason,
} from '../analysis/event-projection.js';
import type {
  BonusFeature,
  EventInput,
  EventLeaguePrior,
  EventScales,
  EventWeights,
  FullGameFeature,
  PlayerRates,
} from '../analysis/event-projection.js';
import {
  FULL_APPEARANCE_MINUTES,
  concedesPoints,
  pointsFromEvents,
} from '../analysis/fpl-scoring.js';
import { poissonZero } from '../analysis/poisson.js';
import { PLAY_FEATURES, playFeatures } from '../analysis/projection.js';
import type { PlayFeature } from '../analysis/projection.js';
import {
  fixtureGoalRates,
  teamMatchesFrom,
  teamStrengths,
} from '../analysis/team-strength.js';
import type {
  FixtureGoalRates,
  TeamMatch,
  TeamStrengths,
} from '../analysis/team-strength.js';
import type { Position } from '../analysis/types.js';
import type { PlayerGameweekRow } from '../dataset/player-gameweek.js';
import type { Projector } from './baselines.js';
import { fitLogistic, fitRidge } from './fit.js';
import type { Example } from './fit.js';
import { PLAY_PENALTY } from './projection-projector.js';
import type {
  GameweekCase,
  HistoryView,
  PlayerTarget,
  SeasonRows,
} from './snapshot.js';

// a finishing strength for training-set rates, whose goalsPer90 is never read
const NO_FINISHING = 1;

// every gameweek of a season shares last season, and every player in a
// gameweek shares its team strengths, so each is worked out once
const leagueCache = new WeakMap<SeasonRows, EventLeaguePrior>();
const lastTeamMatchesCache = new WeakMap<SeasonRows, TeamMatch[]>();
const strengthCache = new WeakMap<HistoryView, TeamStrengths>();

function lastSeasonOf(history: HistoryView): SeasonRows {
  if (history.lastSeason === null) {
    throw new Error(
      `${history.season} has no last season loaded; the event model starts from it`,
    );
  }
  return history.lastSeason;
}

function leaguePriorFor(history: HistoryView): EventLeaguePrior {
  const lastSeason = lastSeasonOf(history);
  const cached = leagueCache.get(lastSeason);
  if (cached !== undefined) return cached;
  const prior = eventLeaguePriorFrom(lastSeason.rows);
  leagueCache.set(lastSeason, prior);
  return prior;
}

function strengthsFor(history: HistoryView): TeamStrengths {
  const cached = strengthCache.get(history);
  if (cached !== undefined) return cached;
  const lastSeason = lastSeasonOf(history);
  let lastMatches = lastTeamMatchesCache.get(lastSeason);
  if (lastMatches === undefined) {
    lastMatches = teamMatchesFrom(lastSeason.rows);
    lastTeamMatchesCache.set(lastSeason, lastMatches);
  }
  const strengths = teamStrengths(teamMatchesFrom(history.thisSeason), lastMatches);
  strengthCache.set(history, strengths);
  return strengths;
}

/** the model's input, read only from the leak-proof view and the target */
export function eventInputFor(target: PlayerTarget, history: HistoryView): EventInput {
  const strengths = strengthsFor(history);
  return {
    season: history.season,
    position: target.position,
    nowCost: target.nowCost,
    deadline: history.firstKickoff,
    fixtures: target.fixtures.map((fixture) => ({
      fixtureDifficulty: fixture.fixtureDifficulty,
      wasHome: fixture.wasHome,
      ...fixtureGoalRates(
        strengths,
        target.teamName,
        fixture.opponentTeamName,
        fixture.wasHome,
      ),
    })),
    thisSeason: history.playerRows(target.playerId),
    lastSeason: summariseEventSeason(
      history.lastSeasonRows(target.playerCode),
      target.position,
    ),
    league: leaguePriorFor(history),
  };
}

export function eventProjector(weights: EventWeights, label: string): Projector {
  return {
    id: 'events',
    label,
    describe:
      "chance of playing x each scoring event's expected count through fpl's scoring rules",
    project: (target, history) =>
      projectEvents(eventInputFor(target, history), weights).expectedPoints,
  };
}

/**
 * one appearance: the model's per 90 rates going in, and what happened. the
 * scales and the finishing strength are fitted on these, using the minutes
 * actually played so the minutes model's errors don't leak into them
 */
export interface AppearanceExample {
  position: Position;
  minutes: number;
  expectedGoalsPer90: number;
  evidence: { goals: number; expectedGoals: number };
  rates: PlayerRates;
  fixture: FixtureGoalRates;
  actual: {
    goals: number;
    assists: number;
    saves: number;
    goalsConceded: number;
    cleanSheet: number;
  };
}

interface Tally {
  sum: number;
  count: number;
}

export interface EventTrainingSet {
  /** every fixture: did the player get on */
  play: Example<PlayFeature>[];
  /** every appearance: did it last 60 minutes */
  fullGame: Example<FullGameFeature>[];
  minutes: { full: Tally; short: Tally };
  /** every appearance: bonus from the events that actually happened */
  bonus: Example<BonusFeature>[];
  appearances: AppearanceExample[];
  /** points the recorded events don't explain: cards, own goals, penalties */
  other: Record<Position, Tally>;
}

/**
 * one example per player per fixture of a training season. features come from
 * the leak-proof view; targets from that fixture's row, which fitting may read
 */
export function eventTrainingSet(
  cases: readonly GameweekCase[],
  seasonRows: readonly PlayerGameweekRow[],
): EventTrainingSet {
  const rowByFixture = new Map(
    seasonRows.map((row) => [`${row.playerId}/${row.fixtureId}`, row]),
  );
  const tally = (): Tally => ({ sum: 0, count: 0 });
  const set: EventTrainingSet = {
    play: [],
    fullGame: [],
    minutes: { full: tally(), short: tally() },
    bonus: [],
    appearances: [],
    other: { GK: tally(), DEF: tally(), MID: tally(), FWD: tally() },
  };
  for (const { history, targets } of cases) {
    for (const target of targets) {
      const input = eventInputFor(target, history);
      const play = playFeatures(input);
      const fullGame = fullGameFeatures(input);
      const evidence = finishingEvidence(input);
      const xgPer90 = expectedGoalsPer90(input);
      // the finishing strength is applied later, per candidate; 0 here leaves goalsPer90 unused
      const rates = playerRates(input, NO_FINISHING);
      target.fixtures.forEach((fixture, index) => {
        const row = rowByFixture.get(`${target.playerId}/${fixture.fixtureId}`);
        const context = input.fixtures[index];
        if (row === undefined || context === undefined) {
          throw new Error(
            `no row for player ${target.playerId} in fixture ${fixture.fixtureId}`,
          );
        }
        set.play.push({ features: play, target: row.minutes > 0 ? 1 : 0 });
        if (row.minutes === 0) return;
        const full = row.minutes >= FULL_APPEARANCE_MINUTES;
        set.fullGame.push({ features: fullGame, target: full ? 1 : 0 });
        add(full ? set.minutes.full : set.minutes.short, row.minutes);
        set.bonus.push({
          features: bonusFeatures(target.position, {
            fullGame: full ? 1 : 0,
            goals: row.goalsScored,
            assists: row.assists,
            cleanSheet: row.cleanSheets,
            saves: row.saves,
            goalsConceded: row.goalsConceded,
          }),
          target: row.bonus,
        });
        set.appearances.push({
          position: target.position,
          minutes: row.minutes,
          expectedGoalsPer90: xgPer90,
          evidence,
          rates,
          fixture: context,
          actual: {
            goals: row.goalsScored,
            assists: row.assists,
            saves: row.saves,
            goalsConceded: row.goalsConceded,
            cleanSheet: row.cleanSheets,
          },
        });
        add(
          set.other[target.position],
          row.totalPoints - pointsFromEvents(target.position, row),
        );
      });
    }
  }
  return set;
}

export function mergeTrainingSets(sets: readonly EventTrainingSet[]): EventTrainingSet {
  const merge = (pick: (set: EventTrainingSet) => Tally): Tally => ({
    sum: sets.reduce((sum, set) => sum + pick(set).sum, 0),
    count: sets.reduce((count, set) => count + pick(set).count, 0),
  });
  return {
    play: sets.flatMap((set) => set.play),
    fullGame: sets.flatMap((set) => set.fullGame),
    minutes: {
      full: merge((set) => set.minutes.full),
      short: merge((set) => set.minutes.short),
    },
    bonus: sets.flatMap((set) => set.bonus),
    appearances: sets.flatMap((set) => set.appearances),
    other: {
      GK: merge((set) => set.other.GK),
      DEF: merge((set) => set.other.DEF),
      MID: merge((set) => set.other.MID),
      FWD: merge((set) => set.other.FWD),
    },
  };
}

export function fitEvents(
  set: EventTrainingSet,
  finishingStrength: number,
): EventWeights {
  return {
    chanceOfPlaying: fitLogistic(set.play, {
      keys: PLAY_FEATURES,
      penalty: PLAY_PENALTY,
      unpenalised: ['intercept'],
    }),
    fullGame: fitLogistic(set.fullGame, {
      keys: FULL_GAME_FEATURES,
      penalty: PLAY_PENALTY,
      unpenalised: ['intercept'],
    }),
    minutes: { full: mean(set.minutes.full), short: mean(set.minutes.short) },
    finishingStrength,
    scales: fitScales(set.appearances, finishingStrength),
    // plain least squares: seven weights, tens of thousands of appearances
    bonus: fitRidge(set.bonus, {
      keys: BONUS_FEATURES,
      penalty: 0,
      unpenalised: BONUS_FEATURES,
    }),
    otherPoints: {
      GK: mean(set.other.GK),
      DEF: mean(set.other.DEF),
      MID: mean(set.other.MID),
      FWD: mean(set.other.FWD),
    },
  };
}

const UNSCALED: EventScales = {
  goals: 1,
  assists: 1,
  saves: 1,
  goalsConceded: 1,
  cleanSheet: 1,
};

/** each scale is total actual over total predicted, given the minutes played */
export function fitScales(
  appearances: readonly AppearanceExample[],
  finishingStrength: number,
): EventScales {
  const predicted = { goals: 0, assists: 0, saves: 0, goalsConceded: 0 };
  const actual = { goals: 0, assists: 0, saves: 0, goalsConceded: 0 };
  const cleanSheetChances: { againstPer90: number; nineties: number; kept: number }[] =
    [];
  for (const example of appearances) {
    const nineties = example.minutes / 90;
    const per90 = eventRatesPer90(
      withFinishing(example, finishingStrength),
      example.fixture,
      UNSCALED,
    );
    predicted.goals += per90.goals * nineties;
    actual.goals += example.actual.goals;
    predicted.assists += per90.assists * nineties;
    actual.assists += example.actual.assists;
    if (example.position === 'GK') {
      predicted.saves += per90.saves * nineties;
      actual.saves += example.actual.saves;
    }
    if (concedesPoints(example.position)) {
      predicted.goalsConceded += per90.goalsConceded * nineties;
      actual.goalsConceded += example.actual.goalsConceded;
      if (example.minutes >= FULL_APPEARANCE_MINUTES) {
        cleanSheetChances.push({
          againstPer90: per90.goalsConceded,
          nineties,
          kept: example.actual.cleanSheet,
        });
      }
    }
  }
  return {
    goals: ratio(actual.goals, predicted.goals, 'goals'),
    assists: ratio(actual.assists, predicted.assists, 'assists'),
    saves: ratio(actual.saves, predicted.saves, 'saves'),
    goalsConceded: ratio(
      actual.goalsConceded,
      predicted.goalsConceded,
      'goals conceded',
    ),
    cleanSheet: cleanSheetScale(cleanSheetChances),
  };
}

// bisection bounds and steps for the clean sheet scale: far wider than any real value
const CLEAN_SHEET_SCALE_RANGE = { low: 0.05, high: 20 };
const BISECTION_STEPS = 60;

/** the scale on goals against that makes poisson predict as many clean sheets as were kept */
function cleanSheetScale(
  chances: readonly { againstPer90: number; nineties: number; kept: number }[],
): number {
  if (chances.length === 0) throw new Error('no full games by keepers or defenders');
  const kept = chances.reduce((sum, chance) => sum + chance.kept, 0);
  const predicted = (scale: number) =>
    chances.reduce(
      (sum, chance) => sum + poissonZero(chance.againstPer90 * scale * chance.nineties),
      0,
    );
  let { low, high } = CLEAN_SHEET_SCALE_RANGE;
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const middle = (low + high) / 2;
    // more scale, fewer predicted clean sheets
    if (predicted(middle) > kept) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

// keeps the log finite for a player whose expected goals are exactly 0
const SMALLEST_GOAL_MEAN = 1e-9;

/**
 * mean poisson negative log-likelihood of the goals scored, given the minutes
 * played, with the goal scale refitted for this strength: how well a
 * finishing strength predicts goals, and nothing else
 */
export function goalLogLoss(
  appearances: readonly AppearanceExample[],
  strength: number,
): number {
  const means = appearances.map(
    (example) =>
      withFinishing(example, strength).goalsPer90 *
      example.fixture.scoringMultiplier *
      (example.minutes / 90),
  );
  const scale = ratio(
    appearances.reduce((sum, example) => sum + example.actual.goals, 0),
    means.reduce((sum, value) => sum + value, 0),
    'goals',
  );
  let loss = 0;
  appearances.forEach((example, index) => {
    const mean = Math.max(SMALLEST_GOAL_MEAN, (means[index] ?? 0) * scale);
    const goals = example.actual.goals;
    loss += mean - goals * Math.log(mean) + logFactorial(goals);
  });
  return loss / appearances.length;
}

function withFinishing(example: AppearanceExample, strength: number): PlayerRates {
  return {
    ...example.rates,
    goalsPer90:
      example.expectedGoalsPer90 *
      finishing(example.evidence.goals, example.evidence.expectedGoals, strength),
  };
}

function ratio(actual: number, predicted: number, event: string): number {
  if (predicted <= 0) throw new Error(`no ${event} predicted to scale against`);
  return actual / predicted;
}

function logFactorial(count: number): number {
  let total = 0;
  for (let k = 2; k <= count; k += 1) total += Math.log(k);
  return total;
}

function add(tally: Tally, value: number): void {
  tally.sum += value;
  tally.count += 1;
}

function mean(tally: Tally): number {
  if (tally.count === 0) throw new Error('nothing to average in the training set');
  return tally.sum / tally.count;
}
