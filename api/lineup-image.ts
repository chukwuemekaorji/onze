import type { VercelRequest, VercelResponse } from '@vercel/node';
import sharp from 'sharp';
import { FplApiError } from '../lib/fpl-client.js';
import {
  generateAnalysisSummary,
  NoCurrentGameweekError,
} from '../lib/generate-analysis-summary.js';
import { renderLineupSvg } from '../lib/render-lineup-svg.js';

function parseManagerId(query: VercelRequest['query']): number {
  const raw = Array.isArray(query.managerId) ? query.managerId[0] : query.managerId;
  const managerId = Number(raw);
  if (!Number.isInteger(managerId) || managerId <= 0) {
    throw new Error('managerId query param must be a positive integer.');
  }
  return managerId;
}

function parseEvent(query: VercelRequest['query']): number | undefined {
  const raw = Array.isArray(query.event) ? query.event[0] : query.event;
  if (raw === undefined) return undefined;
  const event = Number(raw);
  if (!Number.isInteger(event) || event <= 0) {
    throw new Error('event query param must be a positive integer.');
  }
  return event;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  let managerId: number;
  let event: number | undefined;
  try {
    managerId = parseManagerId(req.query);
    event = parseEvent(req.query);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Invalid request.' });
    return;
  }

  try {
    const analysisSummary = await generateAnalysisSummary(managerId, event);
    const svg = renderLineupSvg(analysisSummary.lineup, {
      teamName: analysisSummary.teamName,
      event: analysisSummary.currentEvent,
    });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(png);
  } catch (err) {
    if (err instanceof FplApiError) {
      res.status(err.status === 404 ? 404 : 502).end();
      return;
    }
    if (err instanceof NoCurrentGameweekError) {
      res.status(502).end();
      return;
    }
    console.error('Unexpected error in /api/lineup-image:', err);
    res.status(500).end();
  }
}
