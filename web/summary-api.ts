import type { AnalysisSummary } from '../lib/analysis-summary.js';

interface SummaryResponseBody {
  analysisSummary: AnalysisSummary;
}

interface ErrorResponseBody {
  error: string;
}

const UNREACHABLE_MESSAGE = 'Could not reach the server. Please try again.';

export class SummaryFetchError extends Error {}

export async function fetchSummary(managerId: number): Promise<AnalysisSummary> {
  try {
    const response = await fetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerId }),
    });
    if (!response.ok) {
      const body = (await response.json()) as ErrorResponseBody;
      throw new SummaryFetchError(body.error);
    }
    return ((await response.json()) as SummaryResponseBody).analysisSummary;
  } catch (err) {
    if (err instanceof SummaryFetchError) throw err;
    throw new SummaryFetchError(UNREACHABLE_MESSAGE);
  }
}
