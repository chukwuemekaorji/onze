/**
 * faithfulness: every number and every player name in a report must come
 * from the summary it was written from. numbers may be rounded the way the
 * prompts ask ("about 3 points" for 2.7, prices to 0.1m, chances as %)
 */

import type { AnalysisSummary } from '../../analysis-summary.js';
import {
  HIT_SAFETY_MARGIN,
  FREE_TRANSFER_CAP,
  MAX_PLAYERS_PER_CLUB,
  POINTS_PER_HIT,
} from '../../analysis/transfers.js';
import {
  CLEAN_SHEET_THRESHOLDS,
  GOAL_THREAT_THRESHOLDS,
  PLAYING_THRESHOLDS,
} from '../../plain-labels.js';
import type { Sentence } from './report-text.js';

export interface Violation {
  check: string;
  section: string;
  sentence: string;
  detail: string;
}

/** what a report may mention, gathered once per summary */
export interface SummaryFacts {
  numbers: number[];
  /** prices and the bank in £m: what a "£" amount must match */
  money: number[];
  formations: Set<string>;
  /** web names of every player the summary mentions */
  players: string[];
  /** clubs, leagues, the manager and his team: proper nouns that aren't players */
  otherNames: string[];
}

// ids would excuse almost any integer, so they never count as facts
const ID_KEY = /(^id$|Id$|^code$|^fixture$)/;
// fpl stores money in tenths of a million
const TENTHS_KEY = /^(nowCost|bank|costChangeEvent|bankAfter)$/;
// 0 to 1 in the data, quoted as a percentage
const CHANCE_KEY = /chance|Chance/;

export function summaryFacts(summary: AnalysisSummary): SummaryFacts {
  const numbers = new Set<number>();
  const money = new Set<number>();
  const players = new Set<string>();
  const otherNames = new Set<string>([
    summary.teamName,
    ...summary.managerName.split(/\s+/),
  ]);
  const visit = (value: unknown, key: string): void => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (ID_KEY.test(key)) return;
      numbers.add(value);
      if (TENTHS_KEY.test(key)) {
        numbers.add(value / 10);
        money.add(value / 10);
      }
      if (CHANCE_KEY.test(key)) numbers.add(value * 100);
      return;
    }
    if (Array.isArray(value)) {
      numbers.add(value.length);
      value.forEach((item) => visit(item, key));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.webName === 'string') players.add(record.webName);
    if (typeof record.name === 'string' && 'webName' in record === false) {
      otherNames.add(record.name);
    }
    for (const nameKey of ['teamName', 'teamShortName', 'opponentShortName']) {
      const name = record[nameKey];
      if (typeof name === 'string') otherNames.add(name);
    }
    for (const [childKey, child] of Object.entries(record)) visit(child, childKey);
  };
  visit(summary, '');
  // a plain-labels player has a name and team, not a webName
  for (const name of [...otherNames]) if (players.has(name)) otherNames.delete(name);
  for (const value of timeNumbers(summary)) numbers.add(value);
  for (const threshold of [
    ...Object.values(PLAYING_THRESHOLDS),
    ...Object.values(GOAL_THREAT_THRESHOLDS),
    ...Object.values(CLEAN_SHEET_THRESHOLDS),
  ]) {
    numbers.add(threshold * 100);
  }
  return {
    numbers: [...numbers],
    money: [...money],
    formations: new Set([summary.lineup.formation]),
    players: [...players].sort((a, b) => b.length - a.length),
    otherNames: [...otherNames].filter((name) => name.length > 0),
  };
}

const TIME_ZONES = ['UTC', 'Europe/London', undefined] as const;

/** the deadlines as a reader might see them: day, hour, minute, year, time left */
function timeNumbers(summary: AnalysisSummary): number[] {
  const values: number[] = [];
  const now = Date.parse(summary.generatedAt);
  const stamps = [
    summary.currentEventDeadline,
    summary.nextEvent?.deadline,
    summary.generatedAt,
  ];
  for (const stamp of stamps) {
    if (stamp === undefined || stamp === '') continue;
    const time = Date.parse(stamp);
    if (!Number.isFinite(time)) continue;
    for (const timeZone of TIME_ZONES) {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
      }).formatToParts(time);
      for (const part of parts) {
        if (['year', 'day', 'hour', 'minute'].includes(part.type)) {
          const value = Number.parseInt(part.value, 10);
          values.push(value);
          if (part.type === 'hour') values.push(value % 12 === 0 ? 12 : value % 12);
        }
      }
    }
    if (Number.isFinite(now) && time > now) {
      const hours = (time - now) / 3_600_000;
      values.push(hours, hours / 24);
    }
  }
  return values;
}

// fpl's rules are fair to quote whatever the summary says, but only where the
// sentence is about that rule, or every small number would pass
const RULE_NUMBERS: readonly { value: number; context: RegExp }[] = [
  { value: POINTS_PER_HIT, context: /hit|-4|points? cost/i },
  { value: HIT_SAFETY_MARGIN, context: /margin/i },
  { value: FREE_TRANSFER_CAP, context: /bank|free transfer/i },
  { value: MAX_PLAYERS_PER_CLUB, context: /club|per team|three/i },
  { value: 11, context: /eleven|\bXI\b|starting/i },
  { value: 15, context: /squad/i },
];

const FORMATION = /\b[1-5]-[1-5]-[1-5](?:-[1-5])?\b/g;
const CLOCK = /\b(\d{1,2}):(\d{2})\b/g;
// "£5.5m", "45%", "+2.7", "GW12", "3rd", "-4": a number never starts inside another
const NUMBER = /(?<![\d.,])[-+]?\d+(?:[.,]\d+)?(?=%|m\b|st\b|nd\b|rd\b|th\b|\b)/g;

/** within the rounding a reader would use for a number written this way */
function matches(written: string, value: number): boolean {
  const target = Math.abs(value);
  const parsed = Math.abs(Number.parseFloat(written.replace(',', '.')));
  const decimals = written.split(/[.,]/)[1]?.length ?? 0;
  if (decimals === 0) return Math.abs(parsed - target) < 1;
  return Math.abs(parsed - target) <= 0.5 * 10 ** -decimals + 1e-9;
}

export function checkNumbers(
  sentences: readonly Sentence[],
  facts: SummaryFacts,
): Violation[] {
  const violations: Violation[] = [];
  for (const sentence of sentences) {
    const report = (detail: string) =>
      violations.push({
        check: 'numbers',
        section: sentence.section,
        sentence: sentence.text,
        detail,
      });
    let text = sentence.text;
    for (const formation of text.match(FORMATION) ?? []) {
      if (!facts.formations.has(formation))
        report(`formation ${formation} isn't the summary's`);
    }
    text = text.replace(FORMATION, ' ');
    for (const [, hours = '', minutes = ''] of text.matchAll(CLOCK)) {
      for (const part of [hours, minutes]) {
        if (!facts.numbers.some((value) => matches(part, value))) {
          report(`time ${hours}:${minutes} doesn't match a deadline`);
          break;
        }
      }
    }
    text = text.replace(CLOCK, ' ');
    for (const found of text.matchAll(NUMBER)) {
      const written = found[0];
      // "£5.5m" is money, and only a price or the bank may back it
      const isMoney = text
        .slice(Math.max(0, (found.index ?? 0) - 1), found.index)
        .includes('£');
      const known = (isMoney ? facts.money : facts.numbers).some((value) =>
        matches(written, value),
      );
      const rule =
        !isMoney &&
        RULE_NUMBERS.some(
          (entry) => matches(written, entry.value) && entry.context.test(sentence.text),
        );
      if (!known && !rule) {
        report(
          isMoney
            ? `£${written} isn't a price or bank in the summary`
            : `${written} isn't a number in the summary`,
        );
      }
    }
  }
  return violations;
}

// words that start sentences or name fpl things, never players
const NOT_NAMES = new Set(
  `a about above after again against all also alternatively an and any armband as at attack back be because before being below bench best both bring but by can captain captaincy chip chips choose consider deadline defence defense defenders do don't double down each easy even every expect fair finally first five for forwards four free from gameweek get give go goalkeeper goal good he here high his hit hold however if in injured instead is it its just keep last leave likely looking low make medium meanwhile midfield midfielders money more most move nailed next no none not nothing now of on one only or otherwise outlook over overall pick play plan player players poor price prices put rather right rotation save second sell she should sit so some start starting still suspended swap take that the their them then there these they third this those three to tough transfer transfers two under unlikely up use vice we week weeks when while with worth yes you your
  monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun
  january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec
  i'd i'm i've i'll ok xi gk def mid fwd
  fpl onze gw ai premier league bench boost triple free hit wildcard captain vice-captain basic report`
    .split(/\s+/)
    .filter((word) => word.length > 0),
);

const SENTENCE_OPENER = /^[^\p{L}]*\p{Lu}[\p{L}.'’-]*/u;

// a capitalised word, with the dots, hyphens and apostrophes names carry
const CAPITALISED = /(?<![\p{L}.'’-])\p{Lu}[\p{L}.'’-]*/gu;

/** "You're", "Onze's" and "Don't" read as you, onze and do */
function baseWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/n['’]t$/u, '')
    .replace(/['’](s|re|ll|ve|d|m)$/u, '');
}

export function checkNames(
  sentences: readonly Sentence[],
  facts: SummaryFacts,
): Violation[] {
  const known = [...facts.players, ...facts.otherNames].sort(
    (a, b) => b.length - a.length,
  );
  const violations: Violation[] = [];
  for (const sentence of sentences) {
    // a sentence's first word is capitalised anyway, so it only counts as a
    // name when it's possessive ("Zinedinho's form"); mid-sentence names are
    // always checked. an invented name used only to open a sentence slips by
    let text = sentence.text.replace(SENTENCE_OPENER, (word) =>
      /['’]s$/u.test(word) ? word : ' ',
    );
    for (const name of known) text = text.split(name).join(' ');
    const unknown = (text.match(CAPITALISED) ?? [])
      .map((word) => word.replace(/['’.-]+$/u, ''))
      .filter((word) => word.length > 1 && !NOT_NAMES.has(baseWord(word)));
    for (const word of new Set(unknown)) {
      violations.push({
        check: 'names',
        section: sentence.section,
        sentence: sentence.text,
        detail: `"${word}" isn't a player, club or league in the summary`,
      });
    }
  }
  return violations;
}
