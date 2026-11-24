import { describe, expect, it } from 'vitest';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { Position } from '../lib/analysis/types.js';
import { writeFallbackReport } from '../lib/fallback-writer.js';
import {
  HOW_ONZE_PREDICTS,
  HOW_ONZE_PREDICTS_TITLE,
  JARGON,
} from '../lib/plain-labels.js';
import sampleJson from '../web/fixtures/sample-summary.json';
import { shirtNumbers } from '../web/pitch-layout.js';
import {
  captainHeadline,
  captainOptions,
  hitAdvice,
  planRows,
  transferRows,
} from '../web/report-view.js';
import { SAMPLE_DEADLINE_LEAD_MS, withFreshDates } from '../web/sample-summary.js';

const sample = sampleJson as unknown as AnalysisSummary;
const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const NOW = Date.parse('2026-11-18T12:00:00Z');

describe('the bundled sample summary', () => {
  it('is a fictional manager, never a real one', () => {
    expect(sample.managerName).toBe('Sample Coach');
    expect(sample.teamName).toBe('onze Sample XI');
  });

  it('has a full, legal squad and lineup', () => {
    expect(sample.squad.squad).toHaveLength(15);
    expect(sample.lineup.startingXI).toHaveLength(11);
    expect(sample.lineup.bench).toHaveLength(4);
    for (const player of sample.squad.squad)
      expect(POSITIONS).toContain(player.position);
    const keepers = sample.lineup.startingXI.filter((p) => p.player.position === 'GK');
    expect(keepers).toHaveLength(1);
  });

  it('runs through the real writers and views without gaps', () => {
    const report = writeFallbackReport(sample);
    for (const section of Object.values(report))
      expect(section.length).toBeGreaterThan(0);
    expect(transferRows(sample.transfers, sample.currentEvent).length).toBeGreaterThan(
      0,
    );
    expect(
      captainOptions(sample.captaincy, sample.currentEvent).length,
    ).toBeGreaterThan(0);
    expect(shirtNumbers(sample.lineup).size).toBe(15);
  });
});

describe('withFreshDates', () => {
  it('puts the deadline a fixed lead ahead of now and keeps the gap to the next one', () => {
    const fresh = withFreshDates(sample, NOW);
    expect(Date.parse(fresh.currentEventDeadline)).toBe(NOW + SAMPLE_DEADLINE_LEAD_MS);
    expect(fresh.generatedAt).toBe(new Date(NOW).toISOString());

    const originalGap =
      Date.parse(sample.nextEvent?.deadline ?? '') -
      Date.parse(sample.currentEventDeadline);
    const freshGap =
      Date.parse(fresh.nextEvent?.deadline ?? '') -
      Date.parse(fresh.currentEventDeadline);
    expect(freshGap).toBe(originalGap);
  });

  it('leaves everything but the dates alone', () => {
    const fresh = withFreshDates(sample, NOW);
    expect(fresh.lineup).toBe(sample.lineup);
    expect(fresh.transfers).toBe(sample.transfers);
  });

  it('copes with no next gameweek and an unreadable deadline', () => {
    const endOfSeason = withFreshDates({ ...sample, nextEvent: null }, NOW);
    expect(endOfSeason.nextEvent).toBeNull();

    const broken = withFreshDates({ ...sample, currentEventDeadline: 'soon' }, NOW);
    expect(broken.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it('shows no stats jargon anywhere the views put words on screen', () => {
    const rows = transferRows(sample.transfers, sample.currentEvent);
    const options = captainOptions(sample.captaincy, sample.currentEvent);
    const shown = [
      ...rows.flatMap((row) => [
        row.sentence ?? '',
        row.incoming?.line ?? '',
        ...(row.incoming?.exact ?? []),
      ]),
      ...options.flatMap((option) => [option.card.line, ...option.card.exact]),
      hitAdvice(sample),
      ...planRows(sample.plan).flatMap((row) => [row.headline, row.reason]),
      captainHeadline(sample) ?? '',
      HOW_ONZE_PREDICTS_TITLE,
      HOW_ONZE_PREDICTS,
      ...Object.values(writeFallbackReport(sample)),
    ].join('\n');

    expect(shown).toContain('onze predicts');
    for (const word of JARGON) expect(shown).not.toContain(word);
  });
});
