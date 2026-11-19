import type { Position } from '../analysis/types.js';
import { DatasetValidationError } from './player-gameweek.js';

// csv cells are all strings and the fpl api sends some numbers as strings
// ("0.45"), so every reader takes either and checks the value, not the type

export type RawRecord = Readonly<Record<string, unknown>>;

const POSITIONS: readonly Position[] = ['GK', 'DEF', 'MID', 'FWD'];

function fail(where: string, field: string, value: unknown, expected: string): never {
  const shown = value === undefined ? 'missing' : JSON.stringify(value);
  throw new DatasetValidationError(
    `${where}: field "${field}" is ${shown}, expected ${expected}`,
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** a json value that must be an object, read field by field afterwards */
export function asRecord(value: unknown, where: string): RawRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DatasetValidationError(`${where}: expected an object`);
  }
  return value as RawRecord;
}

export function readArray(
  record: RawRecord,
  field: string,
  where: string,
): readonly unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) fail(where, field, value, 'a list');
  return value;
}

export function readNumber(record: RawRecord, field: string, where: string): number {
  const value = record[field];
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (isBlank(value) || !Number.isFinite(parsed)) fail(where, field, value, 'a number');
  return parsed;
}

export function readInteger(record: RawRecord, field: string, where: string): number {
  const parsed = readNumber(record, field, where);
  if (!Number.isInteger(parsed)) fail(where, field, record[field], 'a whole number');
  return parsed;
}

/** blank means the source didn't record it; anything else must be a number */
export function readOptionalNumber(
  record: RawRecord,
  field: string,
  where: string,
): number | null {
  return isBlank(record[field]) ? null : readNumber(record, field, where);
}

export function readOptionalInteger(
  record: RawRecord,
  field: string,
  where: string,
): number | null {
  return isBlank(record[field]) ? null : readInteger(record, field, where);
}

export function readString(record: RawRecord, field: string, where: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    fail(where, field, value, 'some text');
  }
  return value;
}

/** pandas writes booleans as True and False */
export function readBoolean(record: RawRecord, field: string, where: string): boolean {
  const value = record[field];
  if (value === true || value === 'True' || value === 'true') return true;
  if (value === false || value === 'False' || value === 'false') return false;
  return fail(where, field, value, 'true or false');
}

export function readPosition(
  record: RawRecord,
  field: string,
  where: string,
): Position {
  const value = readString(record, field, where);
  const position = POSITIONS.find((candidate) => candidate === value);
  if (position === undefined) fail(where, field, value, POSITIONS.join(', '));
  return position;
}

/** the fixture difficulty rating, which fpl keeps between 1 and 5 */
export function readDifficulty(
  record: RawRecord,
  field: string,
  where: string,
): number {
  const difficulty = readInteger(record, field, where);
  if (difficulty < 1 || difficulty > 5) fail(where, field, difficulty, '1 to 5');
  return difficulty;
}
