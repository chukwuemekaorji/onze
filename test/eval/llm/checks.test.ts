import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import type { CoachReport } from '../../../lib/coach-prompt.js';
import { checkReport } from '../../../lib/eval/llm/check-report.js';
import { parseReport, sentencesOf } from '../../../lib/eval/llm/report-text.js';

const golden = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../fixtures/golden/real-normal-week.json'),
    'utf8',
  ),
) as { summary: AnalysisSummary };
const summary = golden.summary;
const captain = summary.captaincy.captain?.player;
if (captain === undefined) throw new Error('the golden week has no captain');
const predicted = captain.projection.points;
const bankMillions = (summary.squad.bank / 10).toFixed(1);
const event = summary.currentEvent;

/** a clean report built from the summary's own facts, then one section swapped */
function report(overrides: Partial<CoachReport> = {}): CoachReport {
  return {
    summary: `Gameweek ${event} for ${summary.teamName}, with £${bankMillions}m in the bank.`,
    transfers: 'No transfer needed this week.',
    captaincy: `Captain ${captain?.webName ?? ''}: Onze predicts ${predicted.toFixed(1)} pts.`,
    chips: 'Hold every chip this week.',
    priceAlerts: 'No price moves to worry about.',
    formation: `Play a ${summary.lineup.formation}.`,
    ...overrides,
  };
}

const failing = (overrides: Partial<CoachReport>) =>
  checkReport(report(overrides), summary).violations;

describe('a clean report', () => {
  it('passes every check', () => {
    const result = checkReport(report(), summary);
    expect(result.violations).toEqual([]);
    expect(Object.values(result.passed).every(Boolean)).toBe(true);
  });
});

describe('structure', () => {
  it('accepts the json the app accepts, fenced or not', () => {
    const json = JSON.stringify(report());
    expect(checkReport(json, summary).passed.structure).toBe(true);
    expect(checkReport(`\`\`\`json\n${json}\n\`\`\``, summary).passed.structure).toBe(
      true,
    );
  });

  it('fails a reply that is not json, misses a section, or adds one', () => {
    const notJson = checkReport('Here is your report!', summary);
    expect(notJson.passed.structure).toBe(false);
    expect(notJson.passed.numbers).toBe(false);
    const { chips: _chips, ...missing } = report();
    expect(
      checkReport(JSON.stringify(missing), summary).violations[0]?.detail,
    ).toContain('chips');
    expect(
      checkReport(JSON.stringify({ ...report(), extra: 'x' }), summary).violations[0]
        ?.detail,
    ).toBe('unexpected field "extra"');
    expect(parseReport(JSON.stringify(report({ chips: '  ' }))).problems).toEqual([
      '"chips" is empty',
    ]);
  });
});

describe('numbers', () => {
  it('allows the rounding the prompts ask for', () => {
    const whole = Math.round(predicted);
    expect(
      failing({ captaincy: `Captain ${captain.webName}: about ${whole} points.` }),
    ).toEqual([]);
    // a -4 hit and fpl's own rules are fine to quote
    expect(failing({ transfers: 'A -4 hit is not worth it this week.' })).toEqual([]);
  });

  it('flags a number the summary never had, with its sentence', () => {
    const [violation] = failing({
      captaincy: `Captain ${captain.webName}: Onze predicts 47.3 pts.`,
    });
    expect(violation).toMatchObject({ check: 'numbers', section: 'captaincy' });
    expect(violation?.detail).toBe("47.3 isn't a number in the summary");
    expect(violation?.sentence).toContain('47.3');
  });

  it('flags a wrong price, formation or gameweek', () => {
    expect(failing({ summary: 'You have £97.4m in the bank.' })[0]?.detail).toContain(
      '97.4',
    );
    expect(failing({ formation: 'Play a 2-3-5.' })[0]?.detail).toContain('2-3-5');
    expect(failing({ chips: 'Save your Wildcard for GW99.' })[0]?.detail).toContain(
      '99',
    );
  });

  it('matches a £ amount only against prices and the bank', () => {
    const exact = summary.squad.bank / 10;
    expect(failing({ summary: `You have £${exact.toFixed(1)}m in the bank.` })).toEqual(
      [],
    );
    // a points figure written as money is not a price, even though the number exists
    const horizon = captain.projection.horizonPoints;
    expect(
      failing({ summary: `You have £${horizon.toFixed(1)}m in the bank.` })[0]?.detail,
    ).toBe(`£${horizon.toFixed(1)} isn't a price or bank in the summary`);
  });
});

describe('names', () => {
  it('flags a player who is not in the summary', () => {
    const [violation] = failing({ transfers: 'Bring in Zinedinho for the run.' });
    expect(violation).toMatchObject({ check: 'names', section: 'transfers' });
    expect(violation?.detail).toBe(
      '"Zinedinho" isn\'t a player, club or league in the summary',
    );
  });

  it('flags an unknown name opening a sentence only when it is possessive', () => {
    expect(
      failing({ transfers: "Zinedinho's form is the best around." })[0]?.detail,
    ).toBe('"Zinedinho\'s" isn\'t a player, club or league in the summary');
    expect(failing({ transfers: 'Sitting tight is fine this week.' })).toEqual([]);
  });

  it('accepts summary players, clubs, sentence starters and fpl words', () => {
    expect(
      failing({
        chips: `Don't play Bench Boost or Triple Captain yet; ${captain.webName}'s club ${captain.teamName} is fine.`,
      }),
    ).toEqual([]);
  });
});

describe('wording', () => {
  it('flags an em dash', () => {
    expect(failing({ chips: 'Hold your chips — nothing doubles yet.' })[0]?.check).toBe(
      'dashes',
    );
  });

  it('flags a section that ends on a question', () => {
    expect(
      failing({ chips: 'Hold your chips. Want to talk Wildcard?' })[0]?.check,
    ).toBe('question_ending');
    expect(failing({ chips: 'Why hold? Nothing doubles yet.' })).toEqual([]);
  });

  it('flags every banned word, case and all', () => {
    const checks = failing({ chips: 'The Model likes your xG and the per 90 numbers.' })
      .filter((violation) => violation.check === 'jargon')
      .map((violation) => violation.detail);
    expect(checks).toEqual(['uses "model"', 'uses "xG"', 'uses "per 90"']);
  });

  it("flags expected points and fpl's numbers", () => {
    expect(failing({ captaincy: 'He has the most expected points.' })[0]?.check).toBe(
      'fpl_numbers',
    );
    expect(failing({ captaincy: "FPL's numbers agree." })[0]?.check).toBe(
      'fpl_numbers',
    );
  });

  it('allows one outlook sentence about later weeks, not two, and never this week', () => {
    const later = `Looking ahead, the 5-week outlook saves your transfer in GW${event + 1}.`;
    expect(failing({ transfers: later })).toEqual([]);
    expect(
      failing({
        transfers: `${later} The outlook then has two moves in GW${event + 2}.`,
      })[0]?.detail,
    ).toBe('the outlook takes 2 sentences, at most 1 allowed');
    expect(
      failing({ transfers: 'Looking ahead, the outlook says sell him this week.' })[0]
        ?.detail,
    ).toBe("gives the outlook as this week's advice");
    expect(
      failing({ transfers: `Looking ahead, the outlook has a move in GW${event}.` })[0]
        ?.check,
    ).toBe('outlook');
  });
});

describe('sentencesOf', () => {
  it('splits on sentence ends but keeps initials, prices and formations whole', () => {
    const sentences = sentencesOf(
      report({ transfers: 'Sell N.Jackson for £5.5m. Then play a 4-4-2.' }),
    ).filter((sentence) => sentence.section === 'transfers');
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      'Sell N.Jackson for £5.5m.',
      'Then play a 4-4-2.',
    ]);
    expect(sentences.map((sentence) => sentence.last)).toEqual([false, true]);
  });
});
