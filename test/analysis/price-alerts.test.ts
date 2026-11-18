import { describe, it, expect } from 'vitest';
import { analyzePriceAlerts } from '../../lib/analysis/price-alerts.js';
import { makePlayer } from '../helpers/fixtures.js';

describe('analyzePriceAlerts', () => {
  it('flags a player whose price already changed today', () => {
    const player = makePlayer({ id: 1, costChangeEvent: 1 });

    const result = analyzePriceAlerts([player]);

    expect(result.alerts).toEqual([
      { player, direction: 'rise', status: 'changed_today' },
    ]);
  });

  it('predicts a rise from strong net transfer momentum when price has not moved yet', () => {
    const player = makePlayer({
      id: 1,
      costChangeEvent: 0,
      transfersInEvent: 100_000,
      transfersOutEvent: 10_000,
    });

    const result = analyzePriceAlerts([player]);

    expect(result.alerts).toEqual([
      { player, direction: 'rise', status: 'predicted' },
    ]);
  });

  it('does not alert on borderline net transfers below the threshold', () => {
    const player = makePlayer({
      id: 1,
      costChangeEvent: 0,
      transfersInEvent: 10_000,
      transfersOutEvent: 9_000,
    });

    const result = analyzePriceAlerts([player]);

    expect(result.alerts).toEqual([]);
  });

  it('returns no alerts for an empty player list', () => {
    expect(analyzePriceAlerts([]).alerts).toEqual([]);
  });
});
