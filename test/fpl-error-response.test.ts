import { describe, it, expect } from 'vitest';
import { RequestValidationError, toErrorResponse } from '../lib/fpl-error-response.js';
import { FplApiError } from '../lib/fpl-client.js';
import { NoCurrentGameweekError } from '../lib/generate-analysis-summary.js';

describe('toErrorResponse', () => {
  it('maps a validation error to 400 with its own message', () => {
    const result = toErrorResponse(
      new RequestValidationError('managerId must be a positive integer.'),
    );

    expect(result).toEqual({
      status: 400,
      message: 'managerId must be a positive integer.',
    });
  });

  it('maps an fpl 404 to manager not found', () => {
    const result = toErrorResponse(new FplApiError('not found', 404));

    expect(result.status).toBe(404);
    expect(result.message).toMatch(/manager id not found/i);
  });

  it('maps any other fpl status to 502', () => {
    const result = toErrorResponse(new FplApiError('server error', 503));

    expect(result.status).toBe(502);
    expect(result.message).toMatch(/fpl api is currently unavailable/i);
  });

  it('maps a missing gameweek to 502 with its own message', () => {
    const result = toErrorResponse(new NoCurrentGameweekError('season is over'));

    expect(result).toEqual({ status: 502, message: 'season is over' });
  });

  it('hides unknown errors behind a generic 500', () => {
    const result = toErrorResponse(new Error('secret internal detail'));

    expect(result.status).toBe(500);
    expect(result.message).not.toContain('secret internal detail');
  });

  it('handles a thrown non-error value', () => {
    expect(toErrorResponse('oops').status).toBe(500);
  });
});
