import type Anthropic from '@anthropic-ai/sdk';
import { SENSEI_PERSONA } from './persona.js';
import type { AnalysisSummary } from './analysis-summary.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_SYSTEM_PROMPT = `${SENSEI_PERSONA}

You already gave the user a gameweek report built from the data summary
below. You're now answering a follow-up question about it. Answer only
from this data plus ordinary FPL rules knowledge. If asked about
something the data doesn't cover — a player not listed, a future
season's fixtures, anything you can't ground — say so plainly instead
of guessing.`;

const MAX_CHAT_TOKENS = 600;
// Client is expected to cap history to ~10 turns already (MASTER.md
// §7a); this is a defensive server-side backstop against a misbehaving
// or malicious client blowing up token usage on every request.
const MAX_HISTORY_MESSAGES = 20;

export interface BuildChatRequestOptions {
  analysisSummary: AnalysisSummary;
  history: ChatMessage[];
  question: string;
  model: string;
}

export function buildChatRequest(
  options: BuildChatRequestOptions,
): Anthropic.MessageCreateParamsNonStreaming {
  const recentHistory = options.history.slice(-MAX_HISTORY_MESSAGES);

  return {
    model: options.model,
    max_tokens: MAX_CHAT_TOKENS,
    system: `${CHAT_SYSTEM_PROMPT}\n\nData summary:\n${JSON.stringify(
      options.analysisSummary,
    )}`,
    messages: [
      ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: options.question },
    ],
  };
}
