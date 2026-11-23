import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { ChatMessage } from '../lib/chat-prompt.js';

// one conversation per manager and gameweek, kept across reloads. it's
// grounded in one report, so it's dropped when that report is replaced by
// new data or its deadline passes, as the report cache is
const CHAT_PREFIX = 'onze:chat:v1:';

interface StoredChat {
  /** the report the answers came from; a regenerated report has a new one */
  generatedAt: string;
  /** after this the advice is stale, and so is the chat */
  deadline: string;
  messages: ChatMessage[];
}

function chatKey(managerId: number, gameweek: number): string {
  return `${CHAT_PREFIX}${managerId}:${gameweek}`;
}

function isDeadlinePassed(deadline: string, now: number): boolean {
  const time = new Date(deadline).getTime();
  return Number.isFinite(time) && now > time;
}

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  return (role === 'user' || role === 'assistant') && typeof content === 'string';
}

function parseStored(raw: string): StoredChat | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { generatedAt, deadline, messages } = parsed as Record<string, unknown>;
    if (typeof generatedAt !== 'string' || typeof deadline !== 'string') return null;
    if (!Array.isArray(messages) || !messages.every(isMessage)) return null;
    return { generatedAt, deadline, messages };
  } catch {
    return null;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage unavailable, nothing to clear
  }
}

/** the saved conversation for this report, or none if it's stale, from other data or unreadable */
export function loadChat(
  managerId: number,
  summary: AnalysisSummary,
  now: number = Date.now(),
): ChatMessage[] {
  const key = chatKey(managerId, summary.currentEvent);
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return [];
  }
  if (raw === null) return [];
  const stored = parseStored(raw);
  if (
    stored === null ||
    stored.generatedAt !== summary.generatedAt ||
    isDeadlinePassed(stored.deadline, now)
  ) {
    remove(key);
    return [];
  }
  return stored.messages;
}

export function saveChat(
  managerId: number,
  summary: AnalysisSummary,
  messages: readonly ChatMessage[],
): void {
  const stored: StoredChat = {
    generatedAt: summary.generatedAt,
    deadline: summary.currentEventDeadline,
    messages: [...messages],
  };
  try {
    localStorage.setItem(
      chatKey(managerId, summary.currentEvent),
      JSON.stringify(stored),
    );
  } catch {
    // storage unavailable or full: the chat still works, it just won't survive a reload
  }
}

export function clearChat(managerId: number, gameweek: number): void {
  remove(chatKey(managerId, gameweek));
}

/** drops every saved conversation whose deadline has passed, so old weeks don't pile up */
export function pruneStaleChats(now: number = Date.now()): void {
  let keys: string[];
  try {
    keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ).filter((key): key is string => key !== null && key.startsWith(CHAT_PREFIX));
  } catch {
    return;
  }
  for (const key of keys) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return;
    }
    const stored = raw === null ? null : parseStored(raw);
    if (stored === null || isDeadlinePassed(stored.deadline, now)) remove(key);
  }
}
