import type { FplFixture } from '../fpl-types.js';
import type { SquadContext } from './types.js';

export type ChipName = 'wildcard' | 'bench_boost' | 'free_hit' | 'triple_captain';

export type ChipRecommendation = 'play_now' | 'consider_soon' | 'hold';

export type ChipReasonCode =
  | 'squad_double_gameweek_now'
  | 'squad_double_gameweek_upcoming'
  | 'squad_blank_gameweek_now'
  | 'squad_blank_gameweek_upcoming'
  | 'fixture_swing_upcoming';

export interface GameweekTeamEvent {
  event: number;
  teamIds: number[];
}

export interface ChipSuggestion {
  chip: ChipName;
  recommendation: ChipRecommendation;
  reasonCodes: ChipReasonCode[];
}

export interface ChipsAnalysis {
  doubleGameweeks: GameweekTeamEvent[];
  blankGameweeks: GameweekTeamEvent[];
  suggestions: ChipSuggestion[];
}

function countFixturesPerTeamPerEvent(
  fixtures: FplFixture[],
): Map<number, Map<number, number>> {
  const byEvent = new Map<number, Map<number, number>>();
  for (const fixture of fixtures) {
    if (fixture.event === null) continue;
    const teamCounts = byEvent.get(fixture.event) ?? new Map<number, number>();
    teamCounts.set(fixture.team_h, (teamCounts.get(fixture.team_h) ?? 0) + 1);
    teamCounts.set(fixture.team_a, (teamCounts.get(fixture.team_a) ?? 0) + 1);
    byEvent.set(fixture.event, teamCounts);
  }
  return byEvent;
}

export function detectDoubleGameweeks(fixtures: FplFixture[]): GameweekTeamEvent[] {
  const byEvent = countFixturesPerTeamPerEvent(fixtures);
  const result: GameweekTeamEvent[] = [];
  for (const [event, teamCounts] of byEvent) {
    const teamIds = [...teamCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([teamId]) => teamId);
    if (teamIds.length > 0) result.push({ event, teamIds });
  }
  return result.sort((a, b) => a.event - b.event);
}

/** a blank is zero fixtures while other teams play */
export function detectBlankGameweeks(
  fixtures: FplFixture[],
  allTeamIds: number[],
): GameweekTeamEvent[] {
  const byEvent = countFixturesPerTeamPerEvent(fixtures);
  const result: GameweekTeamEvent[] = [];
  for (const [event, teamCounts] of byEvent) {
    const teamIds = allTeamIds.filter((id) => (teamCounts.get(id) ?? 0) === 0);
    if (teamIds.length > 0) result.push({ event, teamIds });
  }
  return result.sort((a, b) => a.event - b.event);
}

function affectedSquadTeamCount(
  gameweeks: GameweekTeamEvent[],
  event: number,
  squadTeamIds: Set<number>,
): number {
  const gw = gameweeks.find((g) => g.event === event);
  if (!gw) return 0;
  return gw.teamIds.filter((id) => squadTeamIds.has(id)).length;
}

function hasUpcomingDisruption(
  gameweeks: GameweekTeamEvent[],
  fromEventExclusive: number,
  toEventInclusive: number,
  squadTeamIds: Set<number>,
  minAffected: number,
): boolean {
  return gameweeks.some(
    (g) =>
      g.event > fromEventExclusive &&
      g.event <= toEventInclusive &&
      g.teamIds.filter((id) => squadTeamIds.has(id)).length >= minAffected,
  );
}

export interface AnalyzeChipsOptions {
  /** gameweeks to scan, including the current one. default 5 */
  lookaheadEvents?: number;
}

export function analyzeChips(
  fixtures: FplFixture[],
  allTeamIds: number[],
  squad: SquadContext,
  chipsUsed: ChipName[],
  options: AnalyzeChipsOptions = {},
): ChipsAnalysis {
  const lookaheadEvents = options.lookaheadEvents ?? 5;
  const doubleGameweeks = detectDoubleGameweeks(fixtures);
  const blankGameweeks = detectBlankGameweeks(fixtures, allTeamIds);

  const squadTeamIds = new Set(squad.squad.map((p) => p.teamId));
  const currentEvent = squad.currentEvent;
  const horizonEnd = currentEvent + lookaheadEvents - 1;
  const usedSet = new Set(chipsUsed);

  const suggestions: ChipSuggestion[] = [];

  if (!usedSet.has('bench_boost')) {
    const now = affectedSquadTeamCount(doubleGameweeks, currentEvent, squadTeamIds);
    if (now >= 3) {
      suggestions.push({
        chip: 'bench_boost',
        recommendation: 'play_now',
        reasonCodes: ['squad_double_gameweek_now'],
      });
    } else if (
      hasUpcomingDisruption(doubleGameweeks, currentEvent, horizonEnd, squadTeamIds, 3)
    ) {
      suggestions.push({
        chip: 'bench_boost',
        recommendation: 'consider_soon',
        reasonCodes: ['squad_double_gameweek_upcoming'],
      });
    } else {
      suggestions.push({
        chip: 'bench_boost',
        recommendation: 'hold',
        reasonCodes: [],
      });
    }
  }

  if (!usedSet.has('triple_captain')) {
    const now = affectedSquadTeamCount(doubleGameweeks, currentEvent, squadTeamIds);
    if (now >= 1) {
      suggestions.push({
        chip: 'triple_captain',
        recommendation: 'play_now',
        reasonCodes: ['squad_double_gameweek_now'],
      });
    } else if (
      hasUpcomingDisruption(doubleGameweeks, currentEvent, horizonEnd, squadTeamIds, 1)
    ) {
      suggestions.push({
        chip: 'triple_captain',
        recommendation: 'consider_soon',
        reasonCodes: ['squad_double_gameweek_upcoming'],
      });
    } else {
      suggestions.push({
        chip: 'triple_captain',
        recommendation: 'hold',
        reasonCodes: [],
      });
    }
  }

  if (!usedSet.has('free_hit')) {
    const now = affectedSquadTeamCount(blankGameweeks, currentEvent, squadTeamIds);
    if (now >= 4) {
      suggestions.push({
        chip: 'free_hit',
        recommendation: 'play_now',
        reasonCodes: ['squad_blank_gameweek_now'],
      });
    } else if (
      hasUpcomingDisruption(blankGameweeks, currentEvent, horizonEnd, squadTeamIds, 4)
    ) {
      suggestions.push({
        chip: 'free_hit',
        recommendation: 'consider_soon',
        reasonCodes: ['squad_blank_gameweek_upcoming'],
      });
    } else {
      suggestions.push({ chip: 'free_hit', recommendation: 'hold', reasonCodes: [] });
    }
  }

  if (!usedSet.has('wildcard')) {
    const upcomingSwing =
      hasUpcomingDisruption(
        doubleGameweeks,
        currentEvent - 1,
        horizonEnd,
        squadTeamIds,
        3,
      ) ||
      hasUpcomingDisruption(
        blankGameweeks,
        currentEvent - 1,
        horizonEnd,
        squadTeamIds,
        3,
      );
    suggestions.push({
      chip: 'wildcard',
      recommendation: upcomingSwing ? 'consider_soon' : 'hold',
      reasonCodes: upcomingSwing ? ['fixture_swing_upcoming'] : [],
    });
  }

  return { doubleGameweeks, blankGameweeks, suggestions };
}
