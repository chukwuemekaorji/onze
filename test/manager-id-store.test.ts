import { describe, expect, it } from 'vitest';
import { parseManagerId } from '../web/manager-id-store.js';

describe('parseManagerId', () => {
  it('accepts a positive whole number', () => {
    expect(parseManagerId('1234567')).toBe(1234567);
  });

  it('rejects empty, zero, negative and fractional input', () => {
    expect(parseManagerId(null)).toBeNull();
    expect(parseManagerId('')).toBeNull();
    expect(parseManagerId('0')).toBeNull();
    expect(parseManagerId('-5')).toBeNull();
    expect(parseManagerId('1.5')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(parseManagerId('abc')).toBeNull();
  });
});
