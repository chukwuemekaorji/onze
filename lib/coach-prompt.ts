import type Anthropic from '@anthropic-ai/sdk';
import { ONZE_PERSONA } from './persona.js';
import type { AnalysisSummary } from './analysis-summary.js';
import { notableLeague } from './analysis/leagues.js';
import {
  CLEAN_SHEET_THRESHOLDS,
  GOAL_THREAT_THRESHOLDS,
  JARGON,
  PLAYING_THRESHOLDS,
  captainSentence,
  plainPlayers,
  transferSentence,
} from './plain-labels.js';
import type { PlainPlayer } from './plain-labels.js';

export interface CoachReport {
  summary: string;
  transfers: string;
  captaincy: string;
  chips: string;
  priceAlerts: string;
  formation: string;
}

const percent = (chance: number) => `${Math.round(chance * 100)}%`;
const below = (chance: number) => `${Math.round(chance * 100) - 1}%`;

/**
 * how to talk about onze's numbers; shared with chat so both say the same.
 * the bands come from plain-labels.ts, the same ones the ui shows
 */
export const PLAIN_WORDS_GUIDE = `How to talk about the numbers: write for a casual FPL player, in plain
words. "plainPlayers" lists every player in the data with Onze's labels
already worked out: "predictedPoints", "playing", "goalThreat",
"cleanSheet" and "fixture". Describe players with those labels inside a
sentence ("Haaland is nailed on, with a high goal threat and an easy
fixture") and quote points as "Onze predicts 7.3 pts". Say gains and
differences in round numbers: "about 3 more points". "plainSentences"
has the captain and transfer lines written out; reuse them where they
fit. The labels mean:
- playing: "Nailed on" is a ${percent(PLAYING_THRESHOLDS.nailedOn)}+ chance of playing, "Likely to play" ${percent(PLAYING_THRESHOLDS.likely)} to ${below(PLAYING_THRESHOLDS.nailedOn)}, "Rotation risk" ${percent(PLAYING_THRESHOLDS.rotationRisk)} to ${below(PLAYING_THRESHOLDS.likely)}, "Unlikely to play" under ${percent(PLAYING_THRESHOLDS.rotationRisk)}; "Injured" and "Suspended" come from FPL's news.
- goalThreat: his chance to score or assist if he plays. High is ${percent(GOAL_THREAT_THRESHOLDS.high)}+, Medium ${percent(GOAL_THREAT_THRESHOLDS.medium)} to ${below(GOAL_THREAT_THRESHOLDS.high)}, Low under ${percent(GOAL_THREAT_THRESHOLDS.medium)}. Not given for keepers.
- cleanSheet (keepers and defenders): his team's chance of a clean sheet. Good is ${percent(CLEAN_SHEET_THRESHOLDS.good)}+, Fair ${percent(CLEAN_SHEET_THRESHOLDS.fair)} to ${below(CLEAN_SHEET_THRESHOLDS.good)}, Poor under ${percent(CLEAN_SHEET_THRESHOLDS.fair)}.
- fixture: from FPL's fixture difficulty, Easy, Medium or Tough; null means no match that week.

Never use these words unless the user asks for stats in chat: ${JARGON.join(', ')}, expected points. If they do ask, the numbers behind the labels are in each player's "projection", which is Onze's own and never FPL's: "points", "chanceOfPlaying", "pointsIfPlaying", "goalOrAssistChance", "cleanSheetChance", and "horizonPoints" over "horizonEvents" gameweeks. Never invent a number that isn't in the data. "epNext" is FPL's own figure: never base advice on it, and only mention it, named as FPL's, if asked.

Transfer gains ("expectedPointsGain", "projectedNetGain") are how many more points Onze predicts for the gameweek being planned, and the captaincy and lineup follow the same predictions. Weak links are picked over the next few gameweeks, so a swap can suit the coming run while its gain is shown for this week.`;

export interface PlainContext {
  plainPlayers: PlainPlayer[];
  plainSentences: { captain: string | null; transfers: string[] };
}

/** the labels and ready-made sentences sent alongside the summary */
export function plainContext(summary: AnalysisSummary): PlainContext {
  const captain = summary.captaincy.captain?.player;
  const squad = [
    ...summary.lineup.startingXI.map(({ player }) => player),
    ...summary.lineup.bench.map(({ player }) => player),
  ];
  return {
    plainPlayers: plainPlayers(summary),
    plainSentences: {
      captain: captain === undefined ? null : captainSentence(captain, squad),
      transfers: summary.transfers.suggestions.flatMap((suggestion) => {
        const best = suggestion.inCandidates[0];
        return best === undefined
          ? []
          : [
              transferSentence(
                best,
                suggestion.outPlayer,
                suggestion.expectedPointsGain,
              ),
            ];
      }),
    },
  };
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

${PLAIN_WORDS_GUIDE}

Transfers: "transfers.suggestions" is ranked best-first by predicted
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
predicted points gain after the hit, so say it in round numbers). Any suggestions beyond
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
          ...plainContext(summary),
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
