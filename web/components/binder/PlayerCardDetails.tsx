import type { PlayerCard } from '../../report-view.js';

interface PlayerCardDetailsProps {
  card: PlayerCard;
  /** start the line with the player's name, where the row doesn't already show it */
  named?: boolean;
}

/** the plain labels, with the exact numbers behind them a tap away */
export function PlayerCardDetails({ card, named = false }: PlayerCardDetailsProps) {
  return (
    <details className="player-card">
      <summary className="player-card__line">
        {named ? `${card.name}: ${card.line}` : card.line}
      </summary>
      <ul className="player-card__exact">
        {card.exact.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
  );
}
