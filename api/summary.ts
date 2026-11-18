import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateAnalysisSummary } from '../lib/generate-analysis-summary.js';
import { RequestValidationError, toErrorResponse } from '../lib/fpl-error-response.js';

function parseManagerId(body: unknown): number {
  if (typeof body !== 'object' || body === null) {
    throw new RequestValidationError('Request body must be a JSON object.');
  }
  const managerId = Number((body as Record<string, unknown>).managerId);
  if (!Number.isInteger(managerId) || managerId <= 0) {
    throw new RequestValidationError('managerId must be a positive integer.');
  }
  return managerId;
}

// data only: prose is written in the browser so a user's api key never touches this server
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const managerId = parseManagerId(req.body);
    const analysisSummary = await generateAnalysisSummary(managerId);
    res.status(200).json({ analysisSummary });
  } catch (err) {
    const { status, message } = toErrorResponse(err);
    if (status === 500) console.error('Unexpected error in /api/summary:', err);
    res.status(status).json({ error: message });
  }
}
