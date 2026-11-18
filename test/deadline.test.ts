import { describe, expect, it } from 'vitest';
import {
  describeCountdown,
  formatCountdown,
  upcomingDeadline,
} from '../web/deadline.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const CURRENT_DEADLINE = '2026-11-21T11:00:00Z';
const NEXT_DEADLINE = '2026-11-28T13:30:00Z';
const current = new Date(CURRENT_DEADLINE).getTime();
const next = new Date(NEXT_DEADLINE).getTime();

const summary = {
  currentEvent: 12,
  currentEventDeadline: CURRENT_DEADLINE,
  nextEvent: { id: 13, deadline: NEXT_DEADLINE },
};

describe('upcomingDeadline', () => {
  it("counts down to the report's own gameweek while it's open", () => {
    expect(upcomingDeadline(summary, current - 2 * DAY)).toEqual({
      event: 12,
      deadline: CURRENT_DEADLINE,
      msLeft: 2 * DAY,
      isNextGameweek: false,
    });
  });

  it('switches to the next gameweek once the deadline passes', () => {
    const result = upcomingDeadline(summary, current + MINUTE);
    expect(result?.event).toBe(13);
    expect(result?.isNextGameweek).toBe(true);
    expect(result?.msLeft).toBe(next - current - MINUTE);
  });

  it('treats the exact deadline moment as passed', () => {
    expect(upcomingDeadline(summary, current)?.event).toBe(13);
  });

  it('returns null when both deadlines have passed or there is no next gameweek', () => {
    expect(upcomingDeadline(summary, next + MINUTE)).toBeNull();
    expect(
      upcomingDeadline({ ...summary, nextEvent: null }, current + MINUTE),
    ).toBeNull();
  });

  it('skips an unreadable deadline instead of counting to it', () => {
    const broken = { ...summary, currentEventDeadline: 'not a date' };
    expect(upcomingDeadline(broken, current)?.event).toBe(13);
    expect(upcomingDeadline({ ...broken, nextEvent: null }, current)).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('shows days, padded hours and padded minutes', () => {
    expect(formatCountdown(2 * DAY + 4 * HOUR + 31 * MINUTE)).toBe('2d 04h 31m');
  });

  it('rounds down rather than promising time that is not there', () => {
    expect(formatCountdown(59_999)).toBe('0d 00h 00m');
    expect(formatCountdown(HOUR - 1)).toBe('0d 00h 59m');
  });

  it('never goes negative', () => {
    expect(formatCountdown(-5 * MINUTE)).toBe('0d 00h 00m');
  });
});

describe('describeCountdown', () => {
  it('spells the span out with correct plurals', () => {
    expect(describeCountdown(DAY + 2 * HOUR + MINUTE)).toBe(
      '1 day, 2 hours and 1 minute',
    );
  });
});
