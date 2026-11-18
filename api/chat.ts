import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { buildChatRequest } from '../lib/chat-prompt.js';
import type { ChatMessage } from '../lib/chat-prompt.js';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../lib/persona.js';

interface ChatRequestBody {
  message: string;
  analysisSummary: AnalysisSummary;
  history: ChatMessage[];
}

class ValidationError extends Error {}

function parseRequestBody(body: unknown): ChatRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Request body must be a JSON object.');
  }
  const record = body as Record<string, unknown>;

  if (typeof record.message !== 'string' || record.message.trim() === '') {
    throw new ValidationError('message must be a non-empty string.');
  }
  if (
    typeof record.analysisSummary !== 'object' ||
    record.analysisSummary === null
  ) {
    throw new ValidationError(
      'analysisSummary is required — resend the summary returned by /api/coach.',
    );
  }

  const history = Array.isArray(record.history)
    ? (record.history as ChatMessage[])
    : [];

  return {
    message: record.message,
    analysisSummary: record.analysisSummary as AnalysisSummary,
    history,
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  // No fallback for chat by design (MASTER.md §7a) — an ungrounded
  // generic chatbot reply would defeat the point of the feature.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error:
        'Chat is unavailable: no ANTHROPIC_API_KEY is configured for this deployment.',
    });
    return;
  }

  let body: ChatRequestBody;
  try {
    body = parseRequestBody(req.body);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Invalid request.' });
    return;
  }

  try {
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
    const client = new Anthropic({ apiKey });
    const request = buildChatRequest({
      analysisSummary: body.analysisSummary,
      history: body.history,
      question: body.message,
      model,
    });

    const response = await client.messages.create(request);
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Chat LLM response contained no text content.');
    }

    res.status(200).json({ reply: textBlock.text });
  } catch (err) {
    console.error('Unexpected error in /api/chat:', err);
    res.status(500).json({
      error: 'Something went wrong answering your question. Please try again.',
    });
  }
}
