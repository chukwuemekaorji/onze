import { describe, it, expect } from 'vitest';
import { analyzePriceAlerts } from '../../lib/analysis/price-alerts.js';
import { makePlayer } from '../helpers/fixtures.js';

describe('analyzePriceAlerts', () => {
  it('flags a player whose price already changed this gameweek', () => {
    const player = makePlayer({ id: 1, costChangeEvent: 1 });

    const result = analyzePriceAlerts([player]);

    expect(result.alerts).toEqual([
      { player, direction: 'rise', status: 'changed_this_gameweek' },
    ]);
  });

  it('flags heavy buying in a gameweek that opened a day ago', () => {
    const player = makePlayer({
      id: 1,
      costChangeEvent: 0,
      transfersInEvent: 100_000,
      transfersOutEvent: 10_000,
    });

    const result = analyzePriceAlerts([player], { daysSinceGameweekOpened: 1 });

    expect(result.alerts).toEqual([
      { player, direction: 'rise', status: 'demand_this_gameweek' },
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

  it('averages a long gameweek per day instead of comparing its whole total', () => {
    // 90k net over 12 days is 7.5k a day, nowhere near the daily threshold.
    // the old check compared the 90k total with it and flagged a rise
    const player = makePlayer({
      id: 1,
      transfersInEvent: 100_000,
      transfersOutEvent: 10_000,
    });

    expect(
      analyzePriceAlerts([player], { daysSinceGameweekOpened: 12 }).alerts,
    ).toEqual([]);
  });

  it('flags heavy selling as a fall signal', () => {
    const player = makePlayer({
      id: 1,
      transfersInEvent: 5_000,
      transfersOutEvent: 160_000,
    });

    expect(analyzePriceAlerts([player], { daysSinceGameweekOpened: 3 }).alerts).toEqual(
      [{ player, direction: 'fall', status: 'demand_this_gameweek' }],
    );
  });

  it('treats a gameweek that opened hours ago, or an unknown start, as one day', () => {
    const player = makePlayer({
      id: 1,
      transfersInEvent: 60_000,
      transfersOutEvent: 0,
    });

    expect(
      analyzePriceAlerts([player], { daysSinceGameweekOpened: 0.2 }).alerts,
    ).toHaveLength(1);
    expect(
      analyzePriceAlerts([player], { daysSinceGameweekOpened: -3 }).alerts,
    ).toHaveLength(1);
    expect(analyzePriceAlerts([player]).alerts).toHaveLength(1);
  });

  it('returns no alerts for an empty player list', () => {
    expect(analyzePriceAlerts([]).alerts).toEqual([]);
  });
});
