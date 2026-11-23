import { describe, it, expect, vi, afterEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicCallError, sendMessage } from '../web/anthropic-client.js';

const REQUEST: Anthropic.MessageCreateParamsNonStreaming = {
  model: 'claude-sonnet-5-5',
  max_tokens: 10,
  messages: [{ role: 'user', content: 'hi' }],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorBody(type: string, message: string) {
  return { type: 'error', error: { type, message } };
}

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AnthropicCallError);
  return (err as AnthropicCallError).kind;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendMessage', () => {
  it('sends the key with the browser-access headers and returns the reply text', async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, {
        content: [
          { type: 'text', text: 'Captain ' },
          { type: 'text', text: 'Haaland.' },
        ],
      }),
    );

    const text = await sendMessage('sk-ant-test', REQUEST);

    expect(text).toBe('Captain Haaland.');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(JSON.parse(init.body as string)).toEqual(REQUEST);
  });

  it('ignores thinking blocks and returns only the text', async () => {
    stubFetch(async () =>
      jsonResponse(200, {
        stop_reason: 'end_turn',
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: 'Captain Haaland.' },
        ],
      }),
    );
    await expect(sendMessage('sk-ant-test', REQUEST)).resolves.toBe('Captain Haaland.');
  });

  it('fails loudly on a reply cut off at max_tokens, even with text in it', async () => {
    stubFetch(async () =>
      jsonResponse(200, {
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: '{"summary": "Gameweek 12 is a tid' }],
      }),
    );
    expect(await kindOf(sendMessage('sk-ant-test', REQUEST))).toBe('truncated');
  });

  it('maps 401 to invalid_key', async () => {
    stubFetch(async () =>
      jsonResponse(401, errorBody('authentication_error', 'invalid x-api-key')),
    );
    expect(await kindOf(sendMessage('bad', REQUEST))).toBe('invalid_key');
  });

  it('maps 429 to rate_limited', async () => {
    stubFetch(async () =>
      jsonResponse(429, errorBody('rate_limit_error', 'slow down')),
    );
    expect(await kindOf(sendMessage('k', REQUEST))).toBe('rate_limited');
  });

  it('maps a 400 about credit balance to no_credit', async () => {
    stubFetch(async () =>
      jsonResponse(
        400,
        errorBody(
          'invalid_request_error',
          'Your credit balance is too low to access the API.',
        ),
      ),
    );
    expect(await kindOf(sendMessage('k', REQUEST))).toBe('no_credit');
  });

  it('maps 529 to overloaded', async () => {
    stubFetch(async () =>
      jsonResponse(529, errorBody('overloaded_error', 'overloaded')),
    );
    expect(await kindOf(sendMessage('k', REQUEST))).toBe('overloaded');
  });

  it('passes through the api message for any other error', async () => {
    stubFetch(async () =>
      jsonResponse(400, errorBody('invalid_request_error', 'max_tokens too big')),
    );

    const err = await sendMessage('k', REQUEST).catch((e: unknown) => e);

    expect((err as AnthropicCallError).kind).toBe('unknown');
    expect((err as AnthropicCallError).message).toContain('max_tokens too big');
  });

  it('handles an error response that is not json', async () => {
    stubFetch(async () => new Response('<html>bad gateway</html>', { status: 418 }));
    expect(await kindOf(sendMessage('k', REQUEST))).toBe('unknown');
  });

  it('maps a failed fetch to network', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await kindOf(sendMessage('k', REQUEST))).toBe('network');
  });

  it('aborts and maps a slow reply to timeout', async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    expect(await kindOf(sendMessage('k', REQUEST, { timeoutMs: 5 }))).toBe('timeout');
  });

  it('rejects a successful reply with no text', async () => {
    stubFetch(async () => jsonResponse(200, { content: [] }));
    expect(await kindOf(sendMessage('k', REQUEST))).toBe('unknown');
  });
});
