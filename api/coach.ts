import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { FplApiError } from '../lib/fpl-client.js';
import {
  generateAnalysisSummary,
  NoCurrentGameweekError,
} from '../lib/generate-analysis-summary.js';
import { buildCoachRequest, parseCoachResponse } from '../lib/coach-prompt.js';
import type { CoachReport } from '../lib/coach-prompt.js';
import { writeFallbackReport } from '../lib/fallback-writer.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../lib/persona.js';

interface CoachRequestBody {
  managerId: number;
  event?: number;
}

class ValidationError extends Error {}

function parseRequestBody(body: unknown): CoachRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Request body must be a JSON object.');
  }
  const record = body as Record<string, unknown>;

  const managerId = Number(record.managerId);
  if (!Number.isInteger(managerId) || managerId <= 0) {
    throw new ValidationError('managerId must be a positive integer.');
  }

  let event: number | undefined;
  if (record.event !== undefined) {
    event = Number(record.event);
    if (!Number.isInteger(event) || event <= 0) {
      throw new ValidationError('event must be a positive integer.');
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

  let body: CoachRequestBody;
  try {
    body = parseRequestBody(req.body);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Invalid request.' });
    return;
  }

  try {
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
    if (err instanceof FplApiError) {
      const status = err.status === 404 ? 404 : 502;
      res.status(status).json({
        error:
          err.status === 404
            ? 'Manager ID not found. Double-check the ID and try again.'
            : 'The FPL API is currently unavailable. Please try again shortly.',
      });
      return;
    }
    if (err instanceof NoCurrentGameweekError) {
      res.status(502).json({ error: err.message });
      return;
    }
    console.error('Unexpected error in /api/coach:', err);
    res.status(500).json({
      error: 'Something went wrong generating your report. Please try again.',
    });
  }
}
