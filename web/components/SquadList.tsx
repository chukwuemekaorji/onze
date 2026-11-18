import type { AnalysisSummary } from '../../lib/analysis-summary.js';

interface SquadListProps {
  summary: AnalysisSummary;
}

export function SquadList({ summary }: SquadListProps) {
  return (
    <ul id="squad-list" className="squad-grid">
      {summary.squad.squad.map((player) => {
        const pick = summary.squad.picks.find((p) => p.elementId === player.id);
        const tag = pick?.isCaptain ? '(C)' : pick?.isViceCaptain ? '(VC)' : '';
        return (
          <li key={player.id} className="squad-item">
            <span className="squad-item-name">
              {player.webName}
              {tag && <em> {tag}</em>}
            </span>
            <span className="squad-item-meta">
              {player.position} · {player.teamShortName}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
