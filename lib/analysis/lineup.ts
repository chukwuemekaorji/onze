import type { AnalysisPlayer } from './types.js';
import { scoreForEvent } from './scoring.js';

export interface LineupPlayer {
  player: AnalysisPlayer;
  score: number;
}

export interface LineupAnalysis {
  /** e.g. "3-4-3" (def-mid-fwd) */
  formation: string;
  /** gk, def, mid, fwd, each best first */
  startingXI: LineupPlayer[];
  /** sub order: best outfield sub first, backup gk last */
  bench: LineupPlayer[];
}

interface FormationCounts {
  def: number;
  mid: number;
  fwd: number;
}

// fpl's legal outfield shapes: def 3-5, mid 2-5, fwd 1-3
function validFormations(): FormationCounts[] {
  const formations: FormationCounts[] = [];
  for (let def = 3; def <= 5; def++) {
    for (let mid = 2; mid <= 5; mid++) {
      const fwd = 10 - def - mid;
      if (fwd >= 1 && fwd <= 3) formations.push({ def, mid, fwd });
    }
  }
  return formations;
}

function bestN(players: LineupPlayer[], n: number): LineupPlayer[] {
  return [...players].sort((a, b) => b.score - a.score).slice(0, n);
}

/** picks the highest-scoring legal formation, not a fixed one */
export function analyzeLineup(squad: AnalysisPlayer[], event: number): LineupAnalysis {
  const scored: LineupPlayer[] = squad.map((player) => ({
    player,
    score: scoreForEvent(player, event),
  }));

  const byPosition = {
    GK: scored.filter((p) => p.player.position === 'GK'),
    DEF: scored.filter((p) => p.player.position === 'DEF'),
    MID: scored.filter((p) => p.player.position === 'MID'),
    FWD: scored.filter((p) => p.player.position === 'FWD'),
  };

  const startingGk = bestN(byPosition.GK, 1);
  const backupGks = byPosition.GK.filter((p) => !startingGk.includes(p));

  let best: {
    formation: FormationCounts;
    startingXI: LineupPlayer[];
    total: number;
  } | null = null;

  if (startingGk.length === 1) {
    for (const formation of validFormations()) {
      if (
        byPosition.DEF.length < formation.def ||
        byPosition.MID.length < formation.mid ||
        byPosition.FWD.length < formation.fwd
      ) {
        continue;
      }

      const defs = bestN(byPosition.DEF, formation.def);
      const mids = bestN(byPosition.MID, formation.mid);
      const fwds = bestN(byPosition.FWD, formation.fwd);
      const startingXI = [...startingGk, ...defs, ...mids, ...fwds];
      const total = startingXI.reduce((acc, p) => acc + p.score, 0);

      if (!best || total > best.total) {
        best = { formation, startingXI, total };
      }
    }
  }

  if (!best) {
    // an incomplete squad can't fill any legal shape; use what's there
    const startingXI = [
      ...startingGk,
      ...byPosition.DEF,
      ...byPosition.MID,
      ...byPosition.FWD,
    ].slice(0, 11);
    const startingIds = new Set(startingXI.map((p) => p.player.id));
    const bench = scored.filter((p) => !startingIds.has(p.player.id));
    return {
      formation: `${byPosition.DEF.length}-${byPosition.MID.length}-${byPosition.FWD.length}`,
      startingXI,
      bench,
    };
  }

  const startingIds = new Set(best.startingXI.map((p) => p.player.id));
  const benchOutfield = bestN(
    scored.filter((p) => !startingIds.has(p.player.id) && p.player.position !== 'GK'),
    Infinity,
  );

  return {
    formation: `${best.formation.def}-${best.formation.mid}-${best.formation.fwd}`,
    startingXI: best.startingXI,
    bench: [...benchOutfield, ...backupGks],
  };
}
