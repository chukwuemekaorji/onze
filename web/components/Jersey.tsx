import { numberColourFor } from '../club-colours.js';
import type { KitColours } from '../club-colours.js';
import type { Armband } from '../pitch-layout.js';

// drawn around the origin in a 64 by 58 box, so callers just translate and scale
export const JERSEY_HALF_HEIGHT = 28;
const SILHOUETTE =
  'M -8 -28 Q 0 -22 8 -28 L 17 -25 L 32 -12 L 24 -1 L 17 -8 L 17 28 L -17 28 L -17 -8 L -24 -1 L -32 -12 L -17 -25 Z';
const BODY = 'M -17 -25 L -8 -28 Q 0 -22 8 -28 L 17 -25 L 17 28 L -17 28 Z';
const LEFT_SLEEVE = 'M -17 -25 L -32 -12 L -24 -1 L -17 -8 Z';
const RIGHT_SLEEVE = 'M 17 -25 L 32 -12 L 24 -1 L 17 -8 Z';
const COLLAR = 'M -8.5 -27.5 Q 0 -20 8.5 -27.5';

// the armband sits on the shirt's left sleeve, which is the viewer's right
const ARMBAND_X = 24;
const ARMBAND_Y = -13;
const ARMBAND_RADIUS = 9;

const NUMBER_BASELINE_Y = 13;

interface JerseyProps {
  kit: KitColours;
  shirtNumber: number | null;
  armband: Armband;
}

export function Jersey({ kit, shirtNumber, armband }: JerseyProps) {
  return (
    <g className="jersey">
      {/* a thin paper edge separates the shirt from the grass */}
      <path className="jersey__edge" d={SILHOUETTE} />
      <path className="jersey__panel" d={LEFT_SLEEVE} fill={kit.secondary} />
      <path className="jersey__panel" d={RIGHT_SLEEVE} fill={kit.secondary} />
      <path className="jersey__panel" d={BODY} fill={kit.primary} />
      <path className="jersey__collar" d={COLLAR} stroke={kit.secondary} />
      {shirtNumber !== null && (
        <text
          className="jersey__number"
          y={NUMBER_BASELINE_Y}
          fill={numberColourFor(kit)}
        >
          {shirtNumber}
        </text>
      )}
      {armband && (
        <g className={`jersey__armband jersey__armband--${armband}`}>
          <circle cx={ARMBAND_X} cy={ARMBAND_Y} r={ARMBAND_RADIUS} />
          <text x={ARMBAND_X} y={ARMBAND_Y} dy="0.36em">
            {armband === 'captain' ? 'C' : 'V'}
          </text>
        </g>
      )}
    </g>
  );
}
