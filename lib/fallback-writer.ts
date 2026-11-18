/**
 * rule-based report for when there's no key or the ai call fails. same shapes
 * as the llm path, so callers never special-case it. chat has no fallback on purpose.
 */

import type { AnalysisSummary } from './analysis-summary.js';
import type { CoachReport } from './coach-prompt.js';
import type { TransferReasonCode } from './analysis/transfers.js';
import type { ChipName } from './analysis/chips.js';
import type { LineupPlayer } from './analysis/lineup.js';

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

function formatDeadline(iso: string): string {
  if (!iso) return 'unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function writeLeagueContext(summary: AnalysisSummary): string {
  const league = summary.leagueStandings[0];
  if (!league) return '';
  return ` You're ranked ${league.rank} of ${league.totalEntries} in ${league.name}.`;
}

function writeSummary(summary: AnalysisSummary): string {
  return (
    `Gameweek ${summary.currentEvent} report for ${summary.teamName}. ` +
    `Deadline is ${formatDeadline(summary.currentEventDeadline)}. ` +
    `You have ${formatMoney(summary.squad.bank)} in the bank.` +
    writeLeagueContext(summary)
  );
}

function describeSuggestion(
  suggestion: AnalysisSummary['transfers']['suggestions'][number],
): string {
  const reasons = suggestion.reasonCodes
    .map((code) => REASON_CODE_TEXT[code])
    .join(', ');
  const replacement = suggestion.inCandidates[0];

  if (!replacement) {
    return (
      `${suggestion.outPlayer.webName} is a concern (${reasons}), but no ` +
      'affordable replacement was found within your budget. Hold for now.'
    );
  }

  return (
    `Transfer out ${suggestion.outPlayer.webName} ` +
    `(${formatMoney(suggestion.outPlayer.nowCost)}, ${reasons}) for ` +
    `${replacement.webName} (${formatMoney(replacement.nowCost)}).`
  );
}

function writeTransfers(summary: AnalysisSummary): string {
  const { suggestions, recommendedCount, freeTransfers, pointsHitCost } =
    summary.transfers;

  if (recommendedCount === 0) {
    return 'No transfer needed this week. Your squad has no glaring weak links.';
  }

  const recommended = suggestions.slice(0, recommendedCount);
  const lines = recommended.map(describeSuggestion).join(' ');

  if (pointsHitCost === 0) {
    return `You have ${freeTransfers} free transfer${freeTransfers === 1 ? '' : 's'} to use. ${lines}`;
  }

  return `${lines} That costs a ${pointsHitCost}-point hit beyond your ${freeTransfers} free transfer${freeTransfers === 1 ? '' : 's'}, and it's worth it.`;
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
    return 'No chip is worth playing this gameweek. Hold everything.';
  }

  return actionable
    .map((s) => {
      const label = CHIP_LABEL[s.chip];
      return s.recommendation === 'play_now'
        ? `Play ${label} this gameweek given your squad's fixtures.`
        : `${label} is worth considering in the next few gameweeks. Keep an eye on it.`;
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

function namesOf(players: LineupPlayer[]): string {
  return players.length > 0 ? players.map((p) => p.player.webName).join(', ') : 'none';
}

function writeFormation(summary: AnalysisSummary): string {
  const { lineup } = summary;
  if (lineup.startingXI.length === 0) {
    return 'Not enough squad data to recommend a lineup.';
  }

  const byPosition = (position: LineupPlayer['player']['position']) =>
    lineup.startingXI.filter((p) => p.player.position === position);

  return (
    `Play a ${lineup.formation} formation. ` +
    `Goalkeeper: ${namesOf(byPosition('GK'))}. ` +
    `Defense: ${namesOf(byPosition('DEF'))}. ` +
    `Midfield: ${namesOf(byPosition('MID'))}. ` +
    `Attack: ${namesOf(byPosition('FWD'))}. ` +
    `Bench: ${namesOf(lineup.bench)}.`
  );
}

export function writeFallbackReport(summary: AnalysisSummary): CoachReport {
  return {
    summary: writeSummary(summary),
    transfers: writeTransfers(summary),
    captaincy: writeCaptaincy(summary),
    chips: writeChips(summary),
    priceAlerts: writePriceAlerts(summary),
    formation: writeFormation(summary),
  };
}
