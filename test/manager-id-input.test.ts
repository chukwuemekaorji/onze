import { describe, expect, it } from 'vitest';
import { managerIdFromInput, tidyManagerIdInput } from '../web/manager-id-input.js';

describe('managerIdFromInput', () => {
  it('reads a plain id, ignoring surrounding spaces', () => {
    expect(managerIdFromInput('1234567')).toBe(1234567);
    expect(managerIdFromInput('  1234567 ')).toBe(1234567);
  });

  it('pulls the id out of a pasted fpl link', () => {
    expect(
      managerIdFromInput('https://fantasy.premierleague.com/entry/1234567/event/12'),
    ).toBe(1234567);
    expect(managerIdFromInput('fantasy.premierleague.com/entry/1234567/history')).toBe(
      1234567,
    );
    expect(managerIdFromInput('https://fantasy.premierleague.com/entry/42')).toBe(42);
    expect(managerIdFromInput('https://fantasy.premierleague.com/entry/42?x=1')).toBe(
      42,
    );
  });

  it('rejects text, links without an entry id, and ids that are not whole positive numbers', () => {
    expect(managerIdFromInput('')).toBeNull();
    expect(managerIdFromInput('my team')).toBeNull();
    expect(managerIdFromInput('https://fantasy.premierleague.com/my-team')).toBeNull();
    expect(
      managerIdFromInput('https://fantasy.premierleague.com/entry/12ab/event/3'),
    ).toBeNull();
    expect(
      managerIdFromInput('https://fantasy.premierleague.com/entry/0/event/3'),
    ).toBeNull();
    expect(managerIdFromInput('12.5')).toBeNull();
    expect(managerIdFromInput('-5')).toBeNull();
    expect(managerIdFromInput('99999999999999999999')).toBeNull();
  });
});

describe('tidyManagerIdInput', () => {
  it('collapses a pasted link to its id so people see what will be sent', () => {
    expect(
      tidyManagerIdInput('https://fantasy.premierleague.com/entry/1234567/event/12'),
    ).toBe('1234567');
  });

  it('leaves anything else exactly as typed, half-typed links included', () => {
    expect(tidyManagerIdInput('12345')).toBe('12345');
    expect(tidyManagerIdInput('https://fantasy.premierleague.com/entr')).toBe(
      'https://fantasy.premierleague.com/entr',
    );
    expect(tidyManagerIdInput('my team')).toBe('my team');
  });
});
