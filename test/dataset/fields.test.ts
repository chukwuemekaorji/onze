import { describe, expect, it } from 'vitest';
import {
  asRecord,
  readBoolean,
  readDifficulty,
  readInteger,
  readNumber,
  readOptionalNumber,
  readPosition,
  readString,
} from '../../lib/dataset/fields.js';
import { DatasetValidationError } from '../../lib/dataset/player-gameweek.js';

describe('dataset field readers', () => {
  it('read numbers sent as numbers or as strings', () => {
    expect(readNumber({ xg: '0.45' }, 'xg', 'row')).toBe(0.45);
    expect(readNumber({ xg: 0.45 }, 'xg', 'row')).toBe(0.45);
    expect(readInteger({ minutes: '90' }, 'minutes', 'row')).toBe(90);
  });

  it('turn a blank optional value into null, never 0', () => {
    expect(readOptionalNumber({ xg: '' }, 'xg', 'row')).toBeNull();
    expect(readOptionalNumber({}, 'xg', 'row')).toBeNull();
    expect(readOptionalNumber({ xg: '0' }, 'xg', 'row')).toBe(0);
  });

  it('fail loudly on missing or malformed values, naming the field and row', () => {
    expect(() => readNumber({}, 'minutes', 'line 7')).toThrow(
      new DatasetValidationError(
        'line 7: field "minutes" is missing, expected a number',
      ),
    );
    expect(() => readNumber({ minutes: '' }, 'minutes', 'row')).toThrow(
      DatasetValidationError,
    );
    expect(() => readNumber({ minutes: 'ninety' }, 'minutes', 'row')).toThrow(
      'field "minutes" is "ninety", expected a number',
    );
    expect(() => readInteger({ minutes: '89.5' }, 'minutes', 'row')).toThrow(
      'expected a whole number',
    );
    expect(() => readOptionalNumber({ xg: 'n/a' }, 'xg', 'row')).toThrow(
      DatasetValidationError,
    );
    expect(() => readString({ name: '  ' }, 'name', 'row')).toThrow(
      DatasetValidationError,
    );
  });

  it("read pandas' True and False as well as json booleans", () => {
    expect(readBoolean({ home: 'True' }, 'home', 'row')).toBe(true);
    expect(readBoolean({ home: false }, 'home', 'row')).toBe(false);
    expect(() => readBoolean({ home: '1' }, 'home', 'row')).toThrow(
      DatasetValidationError,
    );
  });

  it('accept only the four playing positions and a 1 to 5 difficulty', () => {
    expect(readPosition({ position: 'MID' }, 'position', 'row')).toBe('MID');
    expect(() => readPosition({ position: 'AM' }, 'position', 'row')).toThrow(
      DatasetValidationError,
    );
    expect(readDifficulty({ d: '5' }, 'd', 'row')).toBe(5);
    expect(() => readDifficulty({ d: '6' }, 'd', 'row')).toThrow('expected 1 to 5');
  });

  it('reject json that is not an object', () => {
    expect(() => asRecord([1, 2], 'summary')).toThrow(DatasetValidationError);
    expect(() => asRecord(null, 'summary')).toThrow(DatasetValidationError);
  });
});
