import { track } from '@vercel/analytics';
import type { ReportSource } from './report-writer.js';

// the only events the app sends to vercel web analytics. every property is a
// fixed label or a boolean: never a manager id, a key, a question or a reply
export type GetStartedPlace = 'nav' | 'hero' | 'final';

type AnalyticsEvent =
  | { name: 'get_started'; data: { place: GetStartedPlace } }
  | { name: 'example_opened' }
  | { name: 'report_loaded'; data: { report: ReportSource; example: boolean } }
  | { name: 'key_saved'; data: { remembered: boolean } }
  | { name: 'chat_message_sent' };

function send(event: AnalyticsEvent): void {
  // the package throws outside a browser in dev and test, and analytics must
  // never break the page, so a failed track is dropped
  if (typeof window === 'undefined') return;
  try {
    if ('data' in event) track(event.name, event.data);
    else track(event.name);
  } catch {
    // nothing to tell the user: analytics is not part of what they asked for
  }
}

export function trackGetStarted(place: GetStartedPlace): void {
  send({ name: 'get_started', data: { place } });
}

export function trackExampleOpened(): void {
  send({ name: 'example_opened' });
}

export function trackReportLoaded(report: ReportSource, example: boolean): void {
  send({ name: 'report_loaded', data: { report, example } });
}

export function trackKeySaved(remembered: boolean): void {
  send({ name: 'key_saved', data: { remembered } });
}

export function trackChatMessageSent(): void {
  send({ name: 'chat_message_sent' });
}
