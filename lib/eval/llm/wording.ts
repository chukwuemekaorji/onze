/**
 * onze's persona and wording rules, as written in the prompts: plain words,
 * no stats jargon, no em dashes, no closing question, and the 5-week outlook
 * in one sentence at most, never as this week's advice
 */

import { JARGON } from '../../plain-labels.js';
import type { Violation } from './faithfulness.js';
import type { Sentence } from './report-text.js';

const EM_DASH = '—';
const FPL_NUMBERS =
  /FPL['’]s (own )?(numbers|figures|projections?|predictions?|expected)/i;
const EXPECTED_POINTS = /expected points/i;
// what marks a sentence as being about the outlook rather than this week
const OUTLOOK = /looking ahead|outlook|planner|\d+-week|weeks? ahead/i;
const THIS_WEEK = /this (game)?week|right now/i;

function jargonPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\d])${escaped}(?![\\p{L}\\d])`, 'iu');
}

const JARGON_PATTERNS = JARGON.map((word) => ({ word, pattern: jargonPattern(word) }));

export function checkWording(
  sentences: readonly Sentence[],
  currentEvent: number,
): Violation[] {
  const violations: Violation[] = [];
  const add = (check: string, sentence: Sentence, detail: string) =>
    violations.push({
      check,
      section: sentence.section,
      sentence: sentence.text,
      detail,
    });
  const thisGameweek = new RegExp(`\\b(GW|gameweek)\\s?${currentEvent}\\b`, 'i');
  const outlookSentences: Sentence[] = [];
  for (const sentence of sentences) {
    if (sentence.text.includes(EM_DASH)) add('dashes', sentence, 'uses an em dash');
    if (sentence.last && sentence.text.trimEnd().endsWith('?')) {
      add('question_ending', sentence, 'the section ends on a question');
    }
    for (const { word, pattern } of JARGON_PATTERNS) {
      if (pattern.test(sentence.text)) add('jargon', sentence, `uses "${word}"`);
    }
    if (EXPECTED_POINTS.test(sentence.text))
      add('fpl_numbers', sentence, 'says "expected points"');
    if (FPL_NUMBERS.test(sentence.text))
      add('fpl_numbers', sentence, "quotes FPL's numbers");
    if (OUTLOOK.test(sentence.text)) {
      outlookSentences.push(sentence);
      if (THIS_WEEK.test(sentence.text) || thisGameweek.test(sentence.text)) {
        add('outlook', sentence, "gives the outlook as this week's advice");
      }
    }
  }
  for (const sentence of outlookSentences.slice(1)) {
    add(
      'outlook',
      sentence,
      `the outlook takes ${outlookSentences.length} sentences, at most 1 allowed`,
    );
  }
  return violations;
}
