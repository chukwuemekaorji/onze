/**
 * a coach report as the checks read it: parsed from the model's raw reply the
 * way the app parses it, then split into sentences that remember their section
 */

import { parseCoachResponse } from '../../coach-prompt.js';
import type { CoachReport } from '../../coach-prompt.js';

export const REPORT_SECTIONS = [
  'summary',
  'transfers',
  'captaincy',
  'chips',
  'priceAlerts',
  'formation',
] as const satisfies readonly (keyof CoachReport)[];

export type ReportSection = (typeof REPORT_SECTIONS)[number];

export interface Sentence {
  section: ReportSection;
  text: string;
  /** the section's last sentence */
  last: boolean;
}

/**
 * a sentence ends at . ! or ? followed by a space and something that can start
 * one. "N.Jackson", "£5.5m" and "4-4-2" have no space after the dot, so they stay
 * whole
 */
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=["'(£A-Z0-9À-Ý-])/u;

export function sentencesOf(report: CoachReport): Sentence[] {
  return REPORT_SECTIONS.flatMap((section) => {
    const parts = report[section]
      .split(SENTENCE_BREAK)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return parts.map((text, index) => ({
      section,
      text,
      last: index === parts.length - 1,
    }));
  });
}

export type ParsedReport =
  | { ok: true; report: CoachReport; problems: string[] }
  | { ok: false; problems: string[] };

/**
 * the app's own parser decides whether a reply is usable at all; on top of
 * that the shape must be exact: the six sections, each a non-empty string,
 * nothing else
 */
export function parseReport(raw: string): ParsedReport {
  let report: CoachReport;
  try {
    report = parseCoachResponse(raw);
  } catch (error) {
    return {
      ok: false,
      problems: [error instanceof Error ? error.message : String(error)],
    };
  }
  const problems: string[] = [];
  const allowed: readonly string[] = REPORT_SECTIONS;
  for (const key of Object.keys(report)) {
    if (!allowed.includes(key)) problems.push(`unexpected field "${key}"`);
  }
  for (const section of REPORT_SECTIONS) {
    if (report[section].trim().length === 0) problems.push(`"${section}" is empty`);
  }
  return { ok: true, report, problems };
}
