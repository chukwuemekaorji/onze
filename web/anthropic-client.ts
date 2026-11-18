import type Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 60 * 1000;

// anthropic reports an empty balance as a 400, not a 429
const NO_CREDIT_PATTERN = /credit balance is too low/i;

export type AnthropicErrorKind =
  | 'invalid_key'
  | 'rate_limited'
  | 'no_credit'
  | 'overloaded'
  | 'timeout'
  | 'network'
  | 'unknown';

const MESSAGE_BY_KIND: Record<Exclude<AnthropicErrorKind, 'unknown'>, string> = {
  invalid_key: 'Anthropic rejected your API key. Forget it and save a valid one.',
  rate_limited: 'Anthropic is rate limiting your key. Wait a minute and try again.',
  no_credit: 'Your Anthropic account is out of credit. Top up and try again.',
  overloaded: 'Anthropic is overloaded right now. Try again shortly.',
  timeout: 'Anthropic took too long to respond. Try again.',
  network: "Couldn't reach Anthropic. Check your connection and try again.",
};

export class AnthropicCallError extends Error {
  constructor(
    public readonly kind: AnthropicErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AnthropicCallError';
  }
}

interface AnthropicErrorBody {
  error?: { type?: string; message?: string };
}

export function classifyAnthropicError(
  status: number,
  body: unknown,
): AnthropicCallError {
  const apiMessage = (body as AnthropicErrorBody | null)?.error?.message ?? '';

  if (status === 401) return errorOf('invalid_key');
  if (status === 429) return errorOf('rate_limited');
  if (status === 400 && NO_CREDIT_PATTERN.test(apiMessage)) return errorOf('no_credit');
  if (status === 529 || status >= 500) return errorOf('overloaded');

  const detail = apiMessage ? `: ${apiMessage}` : '.';
  return new AnthropicCallError(
    'unknown',
    `Anthropic returned an error (${status})${detail}`,
  );
}

function errorOf(kind: Exclude<AnthropicErrorKind, 'unknown'>): AnthropicCallError {
  return new AnthropicCallError(kind, MESSAGE_BY_KIND[kind]);
}

export interface SendMessageOptions {
  timeoutMs?: number;
}

// calls anthropic straight from the browser with the user's own key, so the
// key never reaches our server. returns the reply's text.
export async function sendMessage(
  apiKey: string,
  request: Anthropic.MessageCreateParamsNonStreaming,
  options: SendMessageOptions = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let response: Response;
  let body: unknown;
  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
        // anthropic's documented opt-in for browser calls; safe here because the key is the user's own
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    // the timeout also covers reading the body, not just the headers
    body = await response.json().catch(() => null);
  } catch {
    throw errorOf(controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }

  if (controller.signal.aborted) throw errorOf('timeout');
  if (!response.ok) throw classifyAnthropicError(response.status, body);

  const text = extractText(body);
  if (!text) {
    throw new AnthropicCallError('unknown', 'Anthropic sent back an empty reply.');
  }
  return text;
}

function extractText(body: unknown): string {
  const content = (body as Partial<Anthropic.Message> | null)?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
