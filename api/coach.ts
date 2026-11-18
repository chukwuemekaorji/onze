import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { generateAnalysisSummary } from '../lib/generate-analysis-summary.js';
import { RequestValidationError, toErrorResponse } from '../lib/fpl-error-response.js';
import { buildCoachRequest, parseCoachResponse } from '../lib/coach-prompt.js';
import type { CoachReport } from '../lib/coach-prompt.js';
import { writeFallbackReport } from '../lib/fallback-writer.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../lib/persona.js';

interface CoachRequestBody {
  managerId: number;
  event?: number;
}

function parseRequestBody(body: unknown): CoachRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new RequestValidationError('Request body must be a JSON object.');
  }
  const record = body as Record<string, unknown>;

  const managerId = Number(record.managerId);
  if (!Number.isInteger(managerId) || managerId <= 0) {
    throw new RequestValidationError('managerId must be a positive integer.');
  }

  let event: number | undefined;
  if (record.event !== undefined) {
    event = Number(record.event);
    if (!Number.isInteger(event) || event <= 0) {
      throw new RequestValidationError('event must be a positive integer.');
    }
  }

  return event === undefined ? { managerId } : { managerId, event };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = parseRequestBody(req.body);
    const analysisSummary = await generateAnalysisSummary(
      body.managerId,
      body.event,
    );

    const apiKey = process.env.ANTHROPIC_API_KEY;
    let report: CoachReport;
    let usedFallback: boolean;

    if (apiKey) {
      const model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
      const client = new Anthropic({ apiKey });
      const request = buildCoachRequest(analysisSummary, model);
      const response = await client.messages.create(request);
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Coach LLM response contained no text content.');
      }
      report = parseCoachResponse(textBlock.text);
      usedFallback = false;
    } else {
      report = writeFallbackReport(analysisSummary);
      usedFallback = true;
    }

    res.status(200).json({ report, analysisSummary, usedFallback });
  } catch (err) {
    const { status, message } = toErrorResponse(err);
    if (status === 500) console.error('Unexpected error in /api/coach:', err);
    res.status(status).json({ error: message });
  }
}
