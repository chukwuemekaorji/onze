/**
 * every check on one coach report, against the summary it was written from.
 * pure and offline: the same checks run in ci on the basic report and on
 * saved claude replies, and in npm run eval:live on fresh ones
 */

import type { AnalysisSummary } from '../../analysis-summary.js';
import type { CoachReport } from '../../coach-prompt.js';
import { checkNames, checkNumbers, summaryFacts } from './faithfulness.js';
import type { Violation } from './faithfulness.js';
import { parseReport, sentencesOf } from './report-text.js';
import { checkWording } from './wording.js';

export const CHECKS = [
  'structure',
  'numbers',
  'names',
  'dashes',
  'question_ending',
  'jargon',
  'fpl_numbers',
  'outlook',
] as const;

export type CheckId = (typeof CHECKS)[number];

export const CHECK_LABELS: Record<CheckId, string> = {
  structure: 'JSON parses in the expected shape',
  numbers: 'every number is in the summary',
  names: 'every player name is in the summary',
  dashes: 'no em dashes',
  question_ending: "doesn't end on a question",
  jargon: 'no stats jargon',
  fpl_numbers: 'no "expected points" or FPL\'s numbers',
  outlook: "outlook in one sentence at most, never this week's advice",
};

export interface ReportCheck {
  violations: Violation[];
  passed: Record<CheckId, boolean>;
}

/** a raw reply is parsed the way the app parses it; a report object is checked as is */
export function checkReport(
  reply: string | CoachReport,
  summary: AnalysisSummary,
): ReportCheck {
  const violations: Violation[] = [];
  let report: CoachReport | null;
  if (typeof reply === 'string') {
    const parsed = parseReport(reply);
    for (const problem of parsed.problems) {
      violations.push({
        check: 'structure',
        section: 'json',
        sentence: '',
        detail: problem,
      });
    }
    report = parsed.ok ? parsed.report : null;
  } else {
    report = reply;
  }
  if (report !== null) {
    const sentences = sentencesOf(report);
    const facts = summaryFacts(summary);
    violations.push(
      ...checkNumbers(sentences, facts),
      ...checkNames(sentences, facts),
      ...checkWording(sentences, summary.currentEvent),
    );
  }
  const passed = Object.fromEntries(
    CHECKS.map((check) => [
      check,
      !violations.some((violation) => violation.check === check),
    ]),
  ) as Record<CheckId, boolean>;
  // a reply that doesn't parse can't pass anything else either
  if (report === null) for (const check of CHECKS) passed[check] = false;
  return { violations, passed };
}
