/**
 * the four ways of managing a squad the backtest compares. each one is the
 * app's own code: transfers from lib/analysis/transfers.ts or the planner,
 * lineup and armbands from lineup.ts and captaincy.ts. only the view differs
 */

import { analyzeCaptaincy } from '../analysis/captaincy.js';
import { analyzeLineup } from '../analysis/lineup.js';
import { planTransfers } from '../analysis/planner.js';
import { analyzeTransfers } from '../analysis/transfers.js';
import type { AnalysisPlayer, SquadContext } from '../analysis/types.js';
import type { Selection, Swap } from './fpl-rules.js';
import { PLAN_WEEKS } from './views.js';
import type { ViewKind } from './views.js';

export type PolicyId =
  'no-transfers' | 'form-greedy' | 'onze-one-week' | 'onze-planner';

export interface Policy {
  id: PolicyId;
  label: string;
  /** which numbers it decides and picks its team on */
  view: ViewKind;
  /** the deadline's transfers; the squad's players carry their selling prices */
  chooseSwaps(squad: SquadContext, pool: readonly AnalysisPlayer[]): Swap[];
}

// the backtest has no mini-leagues, so the no-hits-when-leading rule never applies
const NOT_LEADING = { isLeadingALeague: false } as const;

function oneWeekSwaps(squad: SquadContext, pool: readonly AnalysisPlayer[]): Swap[] {
  const analysis = analyzeTransfers(squad, [...pool], NOT_LEADING);
  return analysis.suggestions
    .slice(0, analysis.recommendedCount)
    .flatMap((suggestion) => {
      const replacement = suggestion.inCandidates[0];
      return replacement === undefined
        ? []
        : [{ outId: suggestion.outPlayer.id, inId: replacement.id }];
    });
}

export const POLICIES: readonly Policy[] = [
  {
    id: 'no-transfers',
    label: 'No transfers',
    view: 'model',
    chooseSwaps: () => [],
  },
  {
    id: 'form-greedy',
    label: 'Form greedy',
    view: 'form',
    chooseSwaps: oneWeekSwaps,
  },
  {
    id: 'onze-one-week',
    label: 'Onze one-week',
    view: 'model',
    chooseSwaps: oneWeekSwaps,
  },
  {
    id: 'onze-planner',
    label: 'Onze planner',
    view: 'model',
    // planned five weeks ahead every week, and only this week's part is played
    chooseSwaps: (squad, pool) =>
      (
        planTransfers(squad, pool, { weeks: PLAN_WEEKS, ...NOT_LEADING }).weeks[0]
          ?.swaps ?? []
      ).map((swap) => ({ outId: swap.out.id, inId: swap.in.id })),
  },
];

export function policyById(id: PolicyId): Policy {
  const policy = POLICIES.find((entry) => entry.id === id);
  if (policy === undefined) throw new Error(`no policy ${id}`);
  return policy;
}

/** the app's best eleven, bench order and armbands for the gameweek */
export function selectTeam(
  squad: readonly AnalysisPlayer[],
  gameweek: number,
): Selection {
  const lineup = analyzeLineup([...squad], gameweek);
  const startingXI = lineup.startingXI.map((entry) => entry.player);
  const captaincy = analyzeCaptaincy(startingXI, gameweek);
  const [first, second] = [...startingXI].sort(
    (a, b) => b.projection.points - a.projection.points,
  );
  const captainId = captaincy.captain?.player.id ?? first?.id;
  const viceCaptainId = captaincy.viceCaptain?.player.id ?? second?.id;
  if (captainId === undefined || viceCaptainId === undefined) {
    throw new Error('a lineup needs a captain and a vice-captain');
  }
  return {
    startingXI: startingXI.map((player) => player.id),
    bench: lineup.bench.map((entry) => entry.player.id),
    captainId,
    viceCaptainId,
  };
}
