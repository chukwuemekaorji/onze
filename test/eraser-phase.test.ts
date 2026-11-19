import { describe, expect, it } from 'vitest';
import { nextEraserPhase } from '../web/eraser-phase.js';
import type { EraserEvent, EraserPhase } from '../web/eraser-phase.js';

const run = (events: EraserEvent[], from: EraserPhase = 'idle') =>
  events.reduce(nextEraserPhase, from);

describe('nextEraserPhase', () => {
  it('wipes, holds while the refresh runs, then fades out on success', () => {
    expect(run(['refresh-started'])).toBe('wiping');
    expect(run(['refresh-started', 'wipe-finished'])).toBe('erased');
    expect(run(['refresh-started', 'wipe-finished', 'refresh-succeeded'])).toBe(
      'revealing',
    );
    expect(
      run(['refresh-started', 'wipe-finished', 'refresh-succeeded', 'settled']),
    ).toBe('idle');
  });

  it('wipes back to the old pitch when the refresh fails', () => {
    expect(run(['refresh-started', 'wipe-finished', 'refresh-failed'])).toBe(
      'restoring',
    );
    expect(run(['refresh-started', 'wipe-finished', 'refresh-failed', 'settled'])).toBe(
      'idle',
    );
  });

  it('finishes the wipe before showing a refresh that ended mid-wipe', () => {
    expect(run(['refresh-started', 'refresh-succeeded'])).toBe('wiping-then-reveal');
    expect(run(['refresh-started', 'refresh-succeeded', 'wipe-finished'])).toBe(
      'revealing',
    );
    expect(run(['refresh-started', 'refresh-failed'])).toBe('wiping-then-restore');
    expect(run(['refresh-started', 'refresh-failed', 'wipe-finished'])).toBe(
      'restoring',
    );
  });

  it('keeps waiting through a stray settle while a wipe is pending', () => {
    expect(run(['refresh-started', 'refresh-succeeded', 'settled'])).toBe(
      'wiping-then-reveal',
    );
  });

  it('ignores a refresh ending when nothing was being erased, as on first load', () => {
    expect(run(['refresh-succeeded'])).toBe('idle');
    expect(run(['refresh-failed'])).toBe('idle');
    expect(run(['settled'])).toBe('idle');
  });

  it('starts over when another refresh begins mid-reveal', () => {
    expect(run(['refresh-started'], 'revealing')).toBe('wiping');
  });
});

describe('swap timeline', () => {
  it('runs its keyframes in order: peel, land, lift, peel, return, land, then the arrow', async () => {
    const { SWAP_TIMES: t } = await import('../web/motion.js');
    const order = [
      t.inPeeled,
      t.outLanded,
      t.outLifts,
      t.outPeeled,
      t.inReturns,
      t.inLanded,
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((time) => time > 0 && time < 1)).toBe(true);
    // the arrow only starts once the new jersey is on its way back
    expect(t.arrowStarts).toBeGreaterThanOrEqual(t.inReturns);
  });
});
