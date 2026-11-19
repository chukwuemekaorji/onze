import type Anthropic from '@anthropic-ai/sdk';
import { ONZE_PERSONA } from './persona.js';
import type { AnalysisSummary } from './analysis-summary.js';
import { notableLeague } from './analysis/leagues.js';

export interface CoachReport {
  summary: string;
  transfers: string;
  captaincy: string;
  chips: string;
  priceAlerts: string;
  formation: string;
}

export const REPORT_SYSTEM_PROMPT = `${ONZE_PERSONA}

You are writing a gameweek coaching report from a pre-computed data
summary (JSON) describing the user's squad, transfer candidates,
captaincy candidates, chip timing signals, price-change risk, and a
recommended starting XI/formation. The JSON is the only source of
truth. Do not invent players, stats, or fixtures that aren't in it.

The summary includes "generatedAt" (right now) and
"currentEventDeadline" (the transfer deadline for the gameweek you're
reporting on), plus "nextEvent" with the following gameweek's deadline
if there is one. Use these to be time-aware: mention how much time is
left before the deadline when it's relevant (e.g. a price-change alert
or an unmade transfer), using plain phrasing like "the deadline is
Saturday" rather than restating raw timestamps.

Transfers: "transfers.suggestions" is ranked best-first by projected
point gain; "transfers.recommendedCount" says how many of those leading
entries are actually worth making this gameweek — already weighed
against "transfers.freeTransfers" (free transfers banked) and
"transfers.pointsHitCost" (total -4-per-transfer cost of any transfers
beyond the free ones), so don't re-derive that math yourself. If
recommendedCount is 0, say exactly that ("no transfer needed this
week") rather than inventing one to fill the section. Otherwise, state
each of the first recommendedCount suggestions as a decision ("Transfer
OUT_PLAYER for IN_PLAYER") using real names and prices, not "consider"
or "you could." If pointsHitCost is greater than 0, say plainly that
it's worth taking the hit and why (transfers.projectedNetGain is the
expected points gain after the hit). Any suggestions beyond
recommendedCount are weak links you're watching but not recommending a
transfer for yet — mention at most one, briefly, only if it adds real
value.

Formation: "lineup" holds the recommended starting XI, bench order, and
formation (already computed assuming the transfer above, if any, is
made). State the formation and who starts vs. who's benched, using the
real player names.

League context: "notableLeague" is the one mini-league worth naming:
one the user leads or sits in the top 3 of. It is the ONLY league you
may name or quote a rank for, and at most once in the whole report. If
"notableLeague" is null, say nothing about leagues, ranks or rivals
anywhere in the report. "leagueStandings" lists all of the user's
mini-leagues; never name one of those or quote its rank unless it is
"notableLeague". League context never changes the transfer or hit
numbers above, which are already final.

Respond with ONLY a JSON object matching this exact shape — no markdown
fences, no commentary outside the JSON:
{
  "summary": string,
  "transfers": string,
  "captaincy": string,
  "chips": string,
  "priceAlerts": string,
  "formation": string
}`;

const MAX_REPORT_TOKENS = 1500;

export function buildCoachRequest(
  summary: AnalysisSummary,
  model: string,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_REPORT_TOKENS,
    system: REPORT_SYSTEM_PROMPT,
    // the notable league is decided here, not by the model, so the report never
    // singles out an arbitrary league
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          ...summary,
          notableLeague: notableLeague(summary.leagueStandings),
        }),
      },
    ],
  };
}

const REQUIRED_FIELDS = [
  'summary',
  'transfers',
  'captaincy',
  'chips',
  'priceAlerts',
  'formation',
] as const;

// claude sometimes fences the json despite instructions; strip it instead
function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenceMatch ? fenceMatch[1]! : trimmed;
}

export function parseCoachResponse(rawText: string): CoachReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownFence(rawText));
  } catch {
    throw new Error('Coach LLM response was not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Coach LLM response was not a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    if (typeof record[field] !== 'string') {
      throw new Error(`Coach LLM response missing "${field}" field`);
    }
  }

  return parsed as CoachReport;
}
