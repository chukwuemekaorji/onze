import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  trackChatMessageSent,
  trackExampleOpened,
  trackGetStarted,
  trackKeySaved,
  trackReportLoaded,
} from '../web/analytics.js';

// @vercel/analytics queues every event on window.va, which its script reads
function stubVa(): ReturnType<typeof vi.fn> {
  const va = vi.fn();
  vi.stubGlobal('window', { va });
  return va;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analytics events', () => {
  it('sends each event with only fixed labels and booleans', () => {
    const va = stubVa();
    trackGetStarted('hero');
    trackExampleOpened();
    trackReportLoaded('ai', false);
    trackKeySaved(true);
    trackChatMessageSent();

    expect(va.mock.calls).toEqual([
      ['event', { name: 'get_started', data: { place: 'hero' }, options: undefined }],
      ['event', { name: 'example_opened', options: undefined }],
      [
        'event',
        {
          name: 'report_loaded',
          data: { report: 'ai', example: false },
          options: undefined,
        },
      ],
      ['event', { name: 'key_saved', data: { remembered: true }, options: undefined }],
      ['event', { name: 'chat_message_sent', options: undefined }],
    ]);
  });

  it('records a basic report and the example', () => {
    const va = stubVa();
    trackReportLoaded('basic', true);
    expect(va).toHaveBeenCalledWith('event', {
      name: 'report_loaded',
      data: { report: 'basic', example: true },
      options: undefined,
    });
  });

  it('does nothing outside a browser instead of throwing', () => {
    expect(typeof window).toBe('undefined');
    expect(() => trackChatMessageSent()).not.toThrow();
  });

  it('never lets a broken analytics queue break the page', () => {
    vi.stubGlobal('window', {
      va: () => {
        throw new Error('blocked');
      },
    });
    expect(() => trackKeySaved(false)).not.toThrow();
  });
});
