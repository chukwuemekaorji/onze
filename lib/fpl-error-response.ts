import { FplApiError } from './fpl-client.js';
import { NoCurrentGameweekError } from './generate-analysis-summary.js';

export interface ErrorResponse {
  status: number;
  message: string;
}

export class RequestValidationError extends Error {}

const MANAGER_NOT_FOUND_MESSAGE =
  'Manager ID not found. Double-check the ID and try again.';
const FPL_UNAVAILABLE_MESSAGE =
  'The FPL API is currently unavailable. Please try again shortly.';
const UNEXPECTED_ERROR_MESSAGE =
  'Something went wrong generating your report. Please try again.';

// pure so routes stay thin and every route words errors the same way
export function toErrorResponse(err: unknown): ErrorResponse {
  if (err instanceof RequestValidationError) {
    return { status: 400, message: err.message };
  }
  if (err instanceof FplApiError) {
    // fpl 404s on an unknown manager id; anything else means fpl itself is down
    return err.status === 404
      ? { status: 404, message: MANAGER_NOT_FOUND_MESSAGE }
      : { status: 502, message: FPL_UNAVAILABLE_MESSAGE };
  }
  if (err instanceof NoCurrentGameweekError) {
    return { status: 502, message: err.message };
  }
  return { status: 500, message: UNEXPECTED_ERROR_MESSAGE };
}
