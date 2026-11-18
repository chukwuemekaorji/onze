/**
 * Rule-based writer used when no ANTHROPIC_API_KEY is configured. Same
 * input (AnalysisSummary) and output (CoachReport) shape as coach-prompt
 * + the LLM call, so api/coach.ts never needs to special-case which
 * writer produced the report. Report-only — chat has no fallback (see
 * MASTER.md §7a: an ungrounded chatbot would defeat the point).
 */

import type { AnalysisSummary } from './analysis-summary.js';
import type { CoachReport } from './coach-prompt.js';
import type { TransferReasonCode } from './analysis/transfers.js';
import type { ChipName } from './analysis/chips.js';

const REASON_CODE_TEXT: Record<TransferReasonCode, string> = {
  poor_form: 'poor recent form',
  difficult_fixtures: 'a tough run of fixtures',
  rotation_risk: 'rotation risk',
  injury_doubt: 'an injury doubt',
};

const CHIP_LABEL: Record<ChipName, string> = {
  wildcard: 'Wildcard',
  bench_boost: 'Bench Boost',
  free_hit: 'Free Hit',
  triple_captain: 'Triple Captain',
};

function formatMoney(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`;
}

function writeSummary(summary: AnalysisSummary): string {
  return (
    `Gameweek ${summary.currentEvent} report for ${summary.teamName}. ` +
    `You have ${formatMoney(summary.squad.bank)} in the bank.`
  );
}

function writeTransfers(summary: AnalysisSummary): string {
  const { suggestions } = summary.transfers;
  if (suggestions.length === 0) {
    return "No glaring weak links in your squad this week — no transfers recommended.";
  }

  return suggestions
    .map((s) => {
      const reasons = s.reasonCodes.map((code) => REASON_CODE_TEXT[code]).join(', ');
      const replacement = s.inCandidates[0];
      const suggestionText = replacement
        ? `bring in ${replacement.webName} (${formatMoney(replacement.nowCost)})`
        : 'no affordable replacement found within budget';
      return `Consider transferring out ${s.outPlayer.webName} (${reasons}) — ${suggestionText}.`;
    })
    .join(' ');
}

function writeCaptaincy(summary: AnalysisSummary): string {
  const { captain, viceCaptain } = summary.captaincy;
  if (!captain) {
    return 'No eligible captaincy candidates found in your starting XI.';
  }
  const viceText = viceCaptain ? viceCaptain.player.webName : 'no clear second option';
  return `Captain ${captain.player.webName}, with ${viceText} as vice.`;
}

function writeChips(summary: AnalysisSummary): string {
  const actionable = summary.chips.suggestions.filter(
    (s) => s.recommendation !== 'hold',
  );
  if (actionable.length === 0) {
    return 'No chip is worth playing this gameweek — hold everything.';
  }

  return actionable
    .map((s) => {
      const label = CHIP_LABEL[s.chip];
      return s.recommendation === 'play_now'
        ? `${label} is worth considering right now given your squad's fixtures.`
        : `${label} is worth considering in the next few gameweeks — keep an eye on it.`;
    })
    .join(' ');
}

function writePriceAlerts(summary: AnalysisSummary): string {
  const { alerts } = summary.priceAlerts;
  if (alerts.length === 0) {
    return 'No price alerts for your squad this week.';
  }

  return alerts
    .map((a) => {
      const verb = a.direction === 'rise' ? 'rising' : 'falling';
      return a.status === 'changed_today'
        ? `${a.player.webName} already changed price today (${verb}).`
        : `${a.player.webName} is predicted to be at risk of ${verb} in price soon.`;
    })
    .join(' ');
}

export function writeFallbackReport(summary: AnalysisSummary): CoachReport {
  return {
    summary: writeSummary(summary),
    transfers: writeTransfers(summary),
    captaincy: writeCaptaincy(summary),
    chips: writeChips(summary),
    priceAlerts: writePriceAlerts(summary),
  };
}
