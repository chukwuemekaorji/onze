import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { TWO_PART_SHARE } from '../../../lib/analysis/blend-weight.js';
import { EVENT_WEIGHTS } from '../../../lib/analysis/event-weights.js';
import { PROJECTION_WEIGHTS } from '../../../lib/analysis/projection-weights.js';
import type { Position } from '../../../lib/analysis/types.js';
import { greedySquad } from '../../../lib/backtest/start-squads.js';
import type { SquadCandidate } from '../../../lib/backtest/start-squads.js';
import { toPlayerStatus } from '../../../lib/build-context.js';
import { buildMatchHistory } from '../../../lib/build-match-history.js';
import { buildPlayerProjections } from '../../../lib/build-projections.js';
import { FPL_BASE_URL, FPL_USER_AGENT } from '../../../lib/fpl-client.js';
import type {
  FplBootstrapStatic,
  FplEventLive,
  FplFixture,
} from '../../../lib/fpl-types.js';
import { generateAnalysisSummary } from '../../../lib/generate-analysis-summary.js';
import { LAST_SEASON_PRIOR } from '../../../lib/projection-prior.js';
import { RAW_DIR } from '../../data/config.js';
import { failLoudly } from '../shared.js';

/**
 * npm run eval:golden: the golden set for the coach report evals. real fpl
 * data is recorded once (data/raw/golden-fpl/, gitignored) and every scenario
 * is the live /api/summary pipeline run on it, with a small, named edit where
 * the scenario needs one. each scenario checks its own premise, so a fixture
 * can never be saved under a title it doesn't live up to
 */

const RECORDING_FILE = join(RAW_DIR, 'golden-fpl', 'recording.json');
const GOLDEN_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'golden',
);
const SAMPLE_FILE = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'web',
  'fixtures',
  'sample-summary.json',
);
// the manager whose real squad most scenarios start from (the repo's own test manager)
const REAL_MANAGER_ID = 1164353;
// fpl-client caches bootstrap, fixtures and live stats for 10 minutes, so each
// scenario's clock moves past that to make the pipeline read its edited data
const SCENARIO_CLOCK_STEP_MS = 11 * 60 * 1000;
// fpl cost units: 30 is £3.0m
const ROOMY_BANK = 30;

interface Recording {
  recordedAt: string;
  bootstrap: FplBootstrapStatic;
  fixtures: FplFixture[];
  live: Record<string, FplEventLive>;
  entry: Entry;
  history: History;
  picks: Picks;
  picksEvent: number;
}

interface Entry {
  id: number;
  player_first_name: string;
  player_last_name: string;
  name: string;
  leagues: { classic: League[] };
  [key: string]: unknown;
}

interface League {
  id: number;
  name: string;
  league_type: string;
  rank_count: number | null;
  entry_rank: number;
  entry_last_rank: number;
  [key: string]: unknown;
}

interface Pick {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

interface Picks {
  picks: Pick[];
  entry_history: { event: number; bank: number; [key: string]: unknown };
  [key: string]: unknown;
}

interface History {
  chips: { name: string; event: number }[];
  current: { event: number; event_transfers: number; [key: string]: unknown }[];
  [key: string]: unknown;
}

async function fplGet<T>(path: string): Promise<T> {
  const response = await fetch(`${FPL_BASE_URL}${path}`, {
    headers: { 'User-Agent': FPL_USER_AGENT },
  });
  if (!response.ok) throw new Error(`fpl ${path} returned ${response.status}`);
  return (await response.json()) as T;
}

/** fpl's data, fetched once and replayed after, so the set can be rebuilt the same */
async function recording(): Promise<Recording> {
  if (existsSync(RECORDING_FILE)) {
    return JSON.parse(await readFile(RECORDING_FILE, 'utf8')) as Recording;
  }
  const recordedAt = new Date().toISOString();
  const bootstrap = await fplGet<FplBootstrapStatic>('/bootstrap-static/');
  const fixtures = await fplGet<FplFixture[]>('/fixtures/');
  const now = Date.parse(recordedAt);
  const planning =
    bootstrap.events.find((event) => Date.parse(event.deadline_time) > now)?.id ??
    bootstrap.events.length;
  const picksEvent = bootstrap.events.find((event) => event.is_current)?.id ?? planning;
  const live: Record<string, FplEventLive> = {};
  for (const event of bootstrap.events.filter((entry) => entry.id < planning)) {
    live[String(event.id)] = await fplGet<FplEventLive>(`/event/${event.id}/live/`);
  }
  const data: Recording = {
    recordedAt,
    bootstrap,
    fixtures,
    live,
    entry: await fplGet<Entry>(`/entry/${REAL_MANAGER_ID}/`),
    history: await fplGet<History>(`/entry/${REAL_MANAGER_ID}/history/`),
    picks: await fplGet<Picks>(`/entry/${REAL_MANAGER_ID}/event/${picksEvent}/picks/`),
    picksEvent,
  };
  mkdirSync(join(RAW_DIR, 'golden-fpl'), { recursive: true });
  await writeFile(RECORDING_FILE, JSON.stringify(data));
  console.log(`recorded fpl data at ${recordedAt}`);
  return data;
}

/** what a scenario changes: fpl's data and the fake manager's entry, picks and history */
interface Scenario {
  id: string;
  title: string;
  description: string;
  build(base: Recording, tools: Tools): Recording;
  premise(summary: AnalysisSummary, built: Recording): string | null;
}

interface Tools {
  planning: number;
  realSquad: number[];
  sampleSquad: number[];
  templateSquad: { ids: number[]; bank: number };
  bestSquad: { ids: number[]; bank: number };
  teamOf(id: number): number;
}

const POSITION_BY_TYPE: Record<number, Position> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** fifteen ids as fpl picks: keepers, defenders, midfielders, forwards, one captain */
function picksFor(
  data: Recording,
  ids: readonly number[],
  bank: number,
  captainId?: number,
): Picks {
  const typeOf = (id: number) =>
    data.bootstrap.elements.find((element) => element.id === id)?.element_type ?? 3;
  const ordered = [...ids].sort((a, b) => typeOf(a) - typeOf(b));
  const captain = captainId ?? ordered[ordered.length - 1];
  return {
    picks: ordered.map((element, index) => ({
      element,
      position: index + 1,
      multiplier: element === captain ? 2 : 1,
      is_captain: element === captain,
      is_vice_captain: false,
    })),
    entry_history: { ...data.picks.entry_history, bank },
  };
}

/** a season of history giving the wanted free transfers going into the planned week */
function historyFor(
  data: Recording,
  planning: number,
  freeTransfers: 1 | 2 | 5,
): History {
  const weeks = Array.from(
    { length: Math.max(0, planning - 2) },
    (_, index) => index + 2,
  );
  const quietWeeks = freeTransfers - 1;
  return {
    chips: [],
    current: weeks.map((event, index) => ({
      ...(data.history.current.find((entry) => entry.event === event) ?? {}),
      event,
      // one transfer a week uses the free one up; the last few weeks bank theirs
      event_transfers: index >= weeks.length - quietWeeks ? 0 : 1,
      event_transfers_cost: 0,
    })),
  };
}

function setStatus(
  data: Recording,
  ids: readonly number[],
  status: 'i' | 'd',
  chance: number,
) {
  for (const element of data.bootstrap.elements) {
    if (!ids.includes(element.id)) continue;
    element.status = status;
    element.chance_of_playing_next_round = chance;
    element.news =
      status === 'i'
        ? 'Knee injury - Expected back in a month'
        : `${chance}% chance of playing`;
  }
}

/** a later fixture of each club moved into the planned week: a double gameweek */
function makeDoubles(data: Recording, teamIds: readonly number[], planning: number) {
  const doubled = new Set<number>();
  for (const team of teamIds) {
    if (doubled.has(team)) continue;
    const fixture = data.fixtures.find(
      (entry) =>
        entry.event !== null &&
        entry.event > planning + 1 &&
        (entry.team_h === team || entry.team_a === team) &&
        !doubled.has(entry.team_h) &&
        !doubled.has(entry.team_a),
    );
    if (fixture === undefined)
      throw new Error(`no later fixture to move for team ${team}`);
    fixture.event = planning;
    doubled.add(fixture.team_h);
    doubled.add(fixture.team_a);
  }
}

/** the clubs' fixtures in the planned week postponed: a blank gameweek */
function makeBlanks(data: Recording, teamIds: readonly number[], planning: number) {
  for (const fixture of data.fixtures) {
    if (
      fixture.event === planning &&
      (teamIds.includes(fixture.team_h) || teamIds.includes(fixture.team_a))
    ) {
      fixture.event = null;
    }
  }
}

function withEntry(
  data: Recording,
  picks: Picks,
  history: History,
  leadingALeague = false,
): Recording {
  const entry = clone(data.entry);
  if (leadingALeague) {
    const league = entry.leagues.classic.find((entry) => entry.league_type === 'x');
    if (league === undefined)
      throw new Error('the real entry has no private league to lead');
    league.entry_rank = 1;
    league.entry_last_rank = 1;
  }
  return { ...data, entry, picks, history };
}

/** the real squad's outfield starters by price, dearest first, so edits hit players who matter */
function outfieldByPrice(data: Recording, ids: readonly number[]): number[] {
  return ids
    .map((id) => data.bootstrap.elements.find((element) => element.id === id))
    .filter((element) => element !== undefined && element.element_type !== 1)
    .sort((a, b) => (b?.now_cost ?? 0) - (a?.now_cost ?? 0))
    .map((element) => element?.id ?? 0);
}

function distinctTeams(tools: Tools, ids: readonly number[], count: number): number[] {
  const teams: number[] = [];
  for (const id of ids) {
    const team = tools.teamOf(id);
    if (!teams.includes(team)) teams.push(team);
    if (teams.length === count) break;
  }
  if (teams.length < count) throw new Error(`the squad has fewer than ${count} clubs`);
  return teams;
}

const playsNoneIn = (summary: AnalysisSummary) =>
  summary.squad.squad.filter(
    (player) =>
      !player.nextFixtures.some((fixture) => fixture.event === summary.currentEvent),
  ).length;
const chipNow = (summary: AnalysisSummary, chip: string) =>
  summary.chips.suggestions.some(
    (suggestion) =>
      suggestion.chip === chip && suggestion.recommendation === 'play_now',
  );

const SCENARIOS: readonly Scenario[] = [
  {
    id: 'real-normal-week',
    title: 'A normal week, a real squad',
    description: "Manager 1164353's real squad, bank, history and leagues, unchanged.",
    build: (base) => base,
    premise: () => null,
  },
  {
    id: 'real-sample-team',
    title: 'The bundled sample team',
    description: "The app's example squad, with 2 free transfers.",
    build: (base, tools) =>
      withEntry(
        base,
        picksFor(base, tools.sampleSquad, base.picks.entry_history.bank),
        historyFor(base, tools.planning, 2),
      ),
    premise: (summary) =>
      summary.squad.freeTransfers === 2 ? null : 'expected 2 free transfers',
  },
  {
    id: 'real-template-team',
    title: 'The most-owned template squad',
    description:
      "The most-owned legal £100m squad by FPL's selected-by percentage, 1 free transfer.",
    build: (base, tools) =>
      withEntry(
        base,
        picksFor(base, tools.templateSquad.ids, tools.templateSquad.bank),
        historyFor(base, tools.planning, 1),
      ),
    premise: () => null,
  },
  {
    id: 'no-transfer-needed',
    title: 'No transfer worth making',
    description:
      "The strongest legal squad by Onze's own predictions over the next three weeks, 1 free transfer.",
    build: (base, tools) =>
      withEntry(
        base,
        picksFor(base, tools.bestSquad.ids, tools.bestSquad.bank),
        historyFor(base, tools.planning, 1),
      ),
    premise: (summary) =>
      summary.transfers.recommendedCount === 0
        ? null
        : 'expected no recommended transfer',
  },
  {
    id: 'hit-pays',
    title: 'A -4 hit that pays',
    description:
      'The real squad with its two dearest outfield players injured, £3.0m in the bank and 1 free transfer, in a gameweek where most clubs play twice.',
    build: (base, tools) => {
      const data = clone(base);
      setStatus(data, outfieldByPrice(data, tools.realSquad).slice(0, 2), 'i', 0);
      // a replacement only gains enough to repay -4 plus the margin when he plays twice
      makeDoubles(
        data,
        data.bootstrap.teams.map((team) => team.id),
        tools.planning,
      );
      return withEntry(
        data,
        picksFor(data, tools.realSquad, ROOMY_BANK),
        historyFor(data, tools.planning, 1),
      );
    },
    premise: (summary) =>
      summary.transfers.pointsHitCost > 0 ? null : 'expected a hit',
  },
  {
    id: 'leading-league-no-hits',
    title: 'Leading a league: no hits',
    description:
      'The hit scenario (two injuries, most clubs playing twice), but top of a private league, so Onze takes no hit.',
    build: (base, tools) => {
      const data = clone(base);
      setStatus(data, outfieldByPrice(data, tools.realSquad).slice(0, 2), 'i', 0);
      // a replacement only gains enough to repay -4 plus the margin when he plays twice
      makeDoubles(
        data,
        data.bootstrap.teams.map((team) => team.id),
        tools.planning,
      );
      return withEntry(
        data,
        picksFor(data, tools.realSquad, ROOMY_BANK),
        historyFor(data, tools.planning, 1),
        true,
      );
    },
    premise: (summary) =>
      summary.transfers.pointsHitCost === 0 &&
      summary.transfers.recommendedCount > 0 &&
      summary.leagueStandings.some((league) => league.rank === 1)
        ? null
        : 'expected a free transfer, no hit, and a league lead',
  },
  {
    id: 'injured-captain',
    title: "Last week's captain is injured",
    description:
      'The real squad with the player it captained injured, 1 free transfer.',
    build: (base, tools) => {
      const data = clone(base);
      const captain = data.picks.picks.find((pick) => pick.is_captain)?.element;
      if (captain === undefined) throw new Error('the real picks have no captain');
      setStatus(data, [captain], 'i', 0);
      return withEntry(
        data,
        picksFor(data, tools.realSquad, data.picks.entry_history.bank, captain),
        historyFor(data, tools.planning, 1),
      );
    },
    premise: (summary, built) => {
      const injured = built.picks.picks.find((pick) => pick.is_captain)?.element;
      return summary.captaincy.captain?.player.id !== injured
        ? null
        : 'expected a new captain';
    },
  },
  {
    id: 'double-gameweek',
    title: 'A double gameweek',
    description:
      'The real squad, with a later fixture of one of its clubs moved into this gameweek.',
    build: (base, tools) => {
      const data = clone(base);
      makeDoubles(
        data,
        distinctTeams(tools, outfieldByPrice(data, tools.realSquad), 1),
        tools.planning,
      );
      return withEntry(
        data,
        picksFor(data, tools.realSquad, data.picks.entry_history.bank),
        historyFor(data, tools.planning, 1),
      );
    },
    premise: (summary) =>
      summary.chips.doubleGameweeks.some(
        (week) =>
          week.event === summary.currentEvent &&
          summary.squad.squad.some((player) => week.teamIds.includes(player.teamId)),
      )
        ? null
        : 'expected a squad club to play twice',
  },
  {
    id: 'blank-gameweek',
    title: 'A blank gameweek',
    description:
      "The real squad, with two of its clubs' fixtures this gameweek postponed.",
    build: (base, tools) => {
      const data = clone(base);
      makeBlanks(
        data,
        distinctTeams(tools, outfieldByPrice(data, tools.realSquad), 2),
        tools.planning,
      );
      return withEntry(
        data,
        picksFor(data, tools.realSquad, data.picks.entry_history.bank),
        historyFor(data, tools.planning, 1),
      );
    },
    premise: (summary) =>
      playsNoneIn(summary) >= 2 ? null : 'expected two squad players without a game',
  },
  {
    id: 'zero-bank',
    title: '£0.0 in the bank',
    description: 'The real squad with nothing in the bank, 1 free transfer.',
    build: (base, tools) =>
      withEntry(
        base,
        picksFor(base, tools.realSquad, 0),
        historyFor(base, tools.planning, 1),
      ),
    premise: (summary) => (summary.squad.bank === 0 ? null : 'expected an empty bank'),
  },
  {
    id: 'five-free-transfers',
    title: '5 free transfers banked',
    description: 'The real squad after four weeks without a transfer.',
    build: (base, tools) =>
      withEntry(
        base,
        picksFor(base, tools.realSquad, base.picks.entry_history.bank),
        historyFor(base, tools.planning, 5),
      ),
    premise: (summary) =>
      summary.squad.freeTransfers === 5 ? null : 'expected 5 free transfers',
  },
  {
    id: 'chip-bench-boost',
    title: 'A chip recommended: Bench Boost',
    description:
      'The real squad with three of its clubs playing twice this gameweek and every chip unused.',
    build: (base, tools) => {
      const data = clone(base);
      makeDoubles(
        data,
        distinctTeams(tools, outfieldByPrice(data, tools.realSquad), 3),
        tools.planning,
      );
      return withEntry(
        data,
        picksFor(data, tools.realSquad, data.picks.entry_history.bank),
        historyFor(data, tools.planning, 1),
      );
    },
    premise: (summary) =>
      chipNow(summary, 'bench_boost') ? null : 'expected bench boost now',
  },
  {
    id: 'chip-free-hit',
    title: 'A chip recommended: Free Hit',
    description:
      "The real squad with four of its clubs' fixtures this gameweek postponed and every chip unused.",
    build: (base, tools) => {
      const data = clone(base);
      makeBlanks(
        data,
        distinctTeams(tools, outfieldByPrice(data, tools.realSquad), 4),
        tools.planning,
      );
      return withEntry(
        data,
        picksFor(data, tools.realSquad, data.picks.entry_history.bank),
        historyFor(data, tools.planning, 1),
      );
    },
    premise: (summary) =>
      chipNow(summary, 'free_hit') ? null : 'expected free hit now',
  },
  {
    id: 'doubtful-players',
    title: 'Several players doubtful',
    description:
      'The real squad with three outfield players flagged 50% and 75% by FPL.',
    build: (base, tools) => {
      const data = clone(base);
      const [first, second, third] = outfieldByPrice(data, tools.realSquad).slice(2);
      setStatus(data, [first ?? 0, second ?? 0], 'd', 50);
      setStatus(data, [third ?? 0], 'd', 75);
      return withEntry(
        data,
        picksFor(data, tools.realSquad, data.picks.entry_history.bank),
        historyFor(data, tools.planning, 1),
      );
    },
    premise: (summary) =>
      summary.squad.squad.filter((player) => player.status === 'd').length >= 3
        ? null
        : 'expected three doubts',
  },
  {
    id: 'money-to-spend',
    title: 'Two free transfers and money to spend',
    description: 'The template squad with £3.0m more in the bank and 2 free transfers.',
    build: (base, tools) =>
      withEntry(
        base,
        picksFor(base, tools.templateSquad.ids, tools.templateSquad.bank + ROOMY_BANK),
        historyFor(base, tools.planning, 2),
      ),
    premise: (summary) =>
      summary.squad.freeTransfers === 2 && summary.squad.bank >= ROOMY_BANK
        ? null
        : 'expected 2 free transfers and £3.0m+',
  },
];

/** the pipeline on one scenario's data: fpl replayed, the fake manager served */
async function summarise(data: Recording, clock: number): Promise<AnalysisSummary> {
  const managerId = 900_000_000;
  const routes = new Map<string, unknown>([
    ['/bootstrap-static/', data.bootstrap],
    ['/fixtures/', data.fixtures],
    [`/entry/${managerId}/`, { ...data.entry, id: managerId }],
    [`/entry/${managerId}/history/`, data.history],
    [`/entry/${managerId}/event/${data.picksEvent}/picks/`, data.picks],
    ...Object.entries(data.live).map(
      ([event, live]) => [`/event/${event}/live/`, live] as const,
    ),
  ]);
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path = String(input).replace(FPL_BASE_URL, '');
    const body = routes.get(path);
    if (body === undefined) throw new Error(`the golden replay has no ${path}`);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  Date.now = () => clock;
  return generateAnalysisSummary(managerId);
}

/** no real names leave the machine: the manager, his team and private leagues are renamed */
function anonymise(summary: AnalysisSummary, clock: number): AnalysisSummary {
  return {
    ...summary,
    managerName: 'Golden Manager',
    teamName: 'Golden XI',
    generatedAt: new Date(clock).toISOString(),
    leagueStandings: summary.leagueStandings.map((league, index) => ({
      ...league,
      id: index + 1,
      name: `Mini-league ${index + 1}`,
    })),
  };
}

async function main(): Promise<void> {
  const base = await recording();
  const start = Date.parse(base.recordedAt);
  const planning =
    base.bootstrap.events.find((event) => Date.parse(event.deadline_time) > start)
      ?.id ?? 0;
  const realSquad = base.picks.picks.map((pick) => pick.element);
  const sample = JSON.parse(await readFile(SAMPLE_FILE, 'utf8')) as AnalysisSummary;
  const teamOf = (id: number) =>
    base.bootstrap.elements.find((element) => element.id === id)?.team ?? 0;
  const candidates = (score: (id: number) => number): SquadCandidate[] =>
    base.bootstrap.elements
      .filter((element) => element.status === 'a')
      .map((element) => ({
        id: element.id,
        position: POSITION_BY_TYPE[element.element_type] ?? 'MID',
        teamId: element.team,
        price: element.now_cost,
        lastSeasonPoints: score(element.id),
      }));
  const owned = new Map(
    base.bootstrap.elements.map((element) => [
      element.id,
      Number.parseFloat(element.selected_by_percent),
    ]),
  );
  const projections = buildPlayerProjections(
    base.bootstrap,
    base.fixtures,
    (element) => toPlayerStatus(element.status),
    {
      event: planning,
      deadline:
        base.bootstrap.events.find((event) => event.id === planning)?.deadline_time ??
        base.recordedAt,
      horizonEvents: 3,
      planEvents: 5,
      history: buildMatchHistory(
        Object.entries(base.live).map(([event, live]) => ({
          event: Number(event),
          live,
        })),
        base.fixtures,
        base.bootstrap,
      ),
      prior: LAST_SEASON_PRIOR,
      weights: {
        twoPart: PROJECTION_WEIGHTS,
        event: EVENT_WEIGHTS,
        twoPartShare: TWO_PART_SHARE,
      },
    },
  );
  const asIds = (squad: { players: { id: number }[]; bank: number }) => ({
    ids: squad.players.map((player) => player.id),
    bank: squad.bank,
  });
  const tools: Tools = {
    planning,
    realSquad,
    sampleSquad: sample.squad.picks.map((pick) => pick.elementId),
    templateSquad: asIds(
      greedySquad(
        candidates((id) => owned.get(id) ?? 0),
        (c) => c.lastSeasonPoints,
      ),
    ),
    bestSquad: asIds(
      greedySquad(
        candidates((id) => projections.get(id)?.horizonPoints ?? 0),
        (c) => c.lastSeasonPoints,
      ),
    ),
    teamOf,
  };
  mkdirSync(GOLDEN_DIR, { recursive: true });
  for (const [index, scenario] of SCENARIOS.entries()) {
    const built = scenario.build(base, tools);
    const clock = start + index * SCENARIO_CLOCK_STEP_MS;
    const summary = await summarise(built, clock);
    const problem = scenario.premise(summary, built);
    if (problem !== null) {
      console.log(
        summary.transfers.suggestions
          .map(
            (s) =>
              `${s.outPlayer.webName} -> ${s.inCandidates[0]?.webName ?? '-'} ${s.expectedPointsGain.toFixed(2)}`,
          )
          .join(' | '),
        'ft',
        summary.squad.freeTransfers,
        'bank',
        summary.squad.bank,
      );
      throw new Error(`${scenario.id}: ${problem}`);
    }
    const fixture = {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      recordedAt: base.recordedAt,
      summary: anonymise(summary, clock),
    };
    await writeFile(
      join(GOLDEN_DIR, `${scenario.id}.json`),
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
    console.log(
      `${scenario.id}: gw ${summary.currentEvent}, ${summary.transfers.recommendedCount} transfers, captain ${summary.captaincy.captain?.player.webName ?? 'none'}`,
    );
  }
  console.log(`written: ${SCENARIOS.length} scenarios to test/fixtures/golden/`);
}

main().catch(failLoudly);
