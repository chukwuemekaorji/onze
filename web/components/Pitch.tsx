import type { AnalysisSummary } from '../../lib/analysis-summary.js';
import type { Position } from '../../lib/analysis/types.js';
import { kitFor } from '../club-colours.js';
import { placeRow, placeStartingXI, shirtNumbers } from '../pitch-layout.js';
import type { PlacedPlayer, PlacementContext, RowLayout } from '../pitch-layout.js';
import { Jersey, JERSEY_HALF_HEIGHT } from './Jersey.js';
import { INK_WOBBLE_FILTER } from './ui/InkFilters.js';

// drawn in metres times ten, so the markings use real fifa dimensions
const UNITS_PER_METRE = 10;
const m = (metres: number) => metres * UNITS_PER_METRE;

const PITCH_WIDTH = m(68);
const PITCH_LENGTH = m(105);
// grass beyond the touchline, so wobbling lines never touch the svg edge
const PITCH_BORDER = m(3);
const CENTRE_CIRCLE_RADIUS = m(9.15);
const PENALTY_AREA_WIDTH = m(40.32);
const PENALTY_AREA_DEPTH = m(16.5);
const GOAL_AREA_WIDTH = m(18.32);
const GOAL_AREA_DEPTH = m(5.5);
const PENALTY_SPOT_DISTANCE = m(11);
const SPOT_RADIUS = m(0.35);
// the real 1m corner arc vanishes on a phone, so it's drawn a little larger
const CORNER_ARC_RADIUS = m(2);
const MOWING_STRIPES = 12;

// gaps below the jersey, in pitch units
const TAPE_GAP = 7;
const TAPE_HEIGHT = 34;
const TAPE_PADDING_X = 10;
// how far a torn tape end bites into the strip
const TAPE_TEAR = 4;
// alternate tapes lean opposite ways, so the row looks stuck on by hand
const TAPE_TILT_DEG = 1.5;
const FIXTURE_BASELINE_GAP = 25;

const PITCH_ROW_LAYOUT: RowLayout = {
  width: PITCH_WIDTH,
  sideMargin: m(4),
  // these two mirror the font sizes in pitch.css
  labelFontSize: 25,
  fixtureFontSize: 20,
  labelGap: 10,
};

// the jersey is drawn 64 units wide; this sizes it to fill its slot on the pitch
const PITCH_JERSEY_SCALE = 1.3;
const BENCH_JERSEY_SCALE = PITCH_JERSEY_SCALE * 0.8;
const BENCH_HEIGHT = 210;
const BENCH_ROW_Y = 75;

const POSITION_NAME: Record<Position, string> = {
  GK: 'goalkeeper',
  DEF: 'defender',
  MID: 'midfielder',
  FWD: 'forward',
};

interface PitchProps {
  summary: AnalysisSummary;
}

export function Pitch({ summary }: PitchProps) {
  const { lineup, captaincy } = summary;
  if (lineup.startingXI.length === 0) {
    return <p className="pitch-empty">Not enough squad data to draw a lineup.</p>;
  }

  const context: PlacementContext = {
    ids: {
      captainId: captaincy.captain?.player.id ?? null,
      viceCaptainId: captaincy.viceCaptain?.player.id ?? null,
    },
    shirtNumbers: shirtNumbers(lineup),
    event: summary.currentEvent,
  };
  const starters = placeStartingXI(
    lineup.startingXI,
    PITCH_LENGTH,
    PITCH_ROW_LAYOUT,
    context,
  );
  const bench = placeRow(lineup.bench, BENCH_ROW_Y, PITCH_ROW_LAYOUT, context);

  return (
    <figure className="pitch">
      <svg
        className="pitch__field"
        viewBox={`${-PITCH_BORDER} ${-PITCH_BORDER} ${PITCH_WIDTH + 2 * PITCH_BORDER} ${PITCH_LENGTH + 2 * PITCH_BORDER}`}
        aria-hidden="true"
        focusable="false"
      >
        <Grass />
        <Markings />
        {starters.map((player) => (
          <PlayerMarker
            key={player.id}
            player={player}
            jerseyScale={PITCH_JERSEY_SCALE}
          />
        ))}
      </svg>

      {bench.length > 0 && (
        <svg
          className="pitch__bench"
          viewBox={`${-PITCH_BORDER} 0 ${PITCH_WIDTH + 2 * PITCH_BORDER} ${BENCH_HEIGHT}`}
          aria-hidden="true"
          focusable="false"
        >
          <text className="pitch__bench-label" x={0} y={22}>
            Bench
          </text>
          {bench.map((player) => (
            <PlayerMarker
              key={player.id}
              player={player}
              jerseyScale={BENCH_JERSEY_SCALE}
            />
          ))}
        </svg>
      )}

      {/* the drawing is hidden from screen readers; this list carries the same lineup */}
      <figcaption className="sr-only">
        Recommended {lineup.formation} lineup.
        <PlayerList heading="Starting eleven" players={starters} />
        <PlayerList heading="Bench" players={bench} />
      </figcaption>
    </figure>
  );
}

function Grass() {
  const stripeDepth = PITCH_LENGTH / MOWING_STRIPES;
  return (
    <g>
      <rect
        className="pitch__grass"
        x={-PITCH_BORDER}
        y={-PITCH_BORDER}
        width={PITCH_WIDTH + 2 * PITCH_BORDER}
        height={PITCH_LENGTH + 2 * PITCH_BORDER}
      />
      {Array.from({ length: MOWING_STRIPES / 2 }, (_, index) => (
        <rect
          key={index}
          className="pitch__stripe"
          x={0}
          y={(index * 2 + 1) * stripeDepth}
          width={PITCH_WIDTH}
          height={stripeDepth}
        />
      ))}
    </g>
  );
}

function Markings() {
  const centreX = PITCH_WIDTH / 2;
  const halfway = PITCH_LENGTH / 2;
  const penaltyAreaLeft = centreX - PENALTY_AREA_WIDTH / 2;
  const goalAreaLeft = centreX - GOAL_AREA_WIDTH / 2;
  const topSpotY = PENALTY_SPOT_DISTANCE;
  const bottomSpotY = PITCH_LENGTH - PENALTY_SPOT_DISTANCE;
  // where the penalty arc meets the box edge, either side of the spot
  const arcHalfWidth = Math.sqrt(
    CENTRE_CIRCLE_RADIUS ** 2 - (PENALTY_AREA_DEPTH - PENALTY_SPOT_DISTANCE) ** 2,
  );
  const r = CENTRE_CIRCLE_RADIUS;
  const c = CORNER_ARC_RADIUS;

  return (
    <g className="pitch__lines" filter={INK_WOBBLE_FILTER}>
      <rect x={0} y={0} width={PITCH_WIDTH} height={PITCH_LENGTH} />
      <line x1={0} y1={halfway} x2={PITCH_WIDTH} y2={halfway} />
      <circle cx={centreX} cy={halfway} r={r} />
      <circle className="pitch__spot" cx={centreX} cy={halfway} r={SPOT_RADIUS} />

      {/* top end */}
      <rect
        x={penaltyAreaLeft}
        y={0}
        width={PENALTY_AREA_WIDTH}
        height={PENALTY_AREA_DEPTH}
      />
      <rect x={goalAreaLeft} y={0} width={GOAL_AREA_WIDTH} height={GOAL_AREA_DEPTH} />
      <circle className="pitch__spot" cx={centreX} cy={topSpotY} r={SPOT_RADIUS} />
      <path
        d={`M ${centreX - arcHalfWidth} ${PENALTY_AREA_DEPTH} A ${r} ${r} 0 0 0 ${centreX + arcHalfWidth} ${PENALTY_AREA_DEPTH}`}
      />

      {/* bottom end */}
      <rect
        x={penaltyAreaLeft}
        y={PITCH_LENGTH - PENALTY_AREA_DEPTH}
        width={PENALTY_AREA_WIDTH}
        height={PENALTY_AREA_DEPTH}
      />
      <rect
        x={goalAreaLeft}
        y={PITCH_LENGTH - GOAL_AREA_DEPTH}
        width={GOAL_AREA_WIDTH}
        height={GOAL_AREA_DEPTH}
      />
      <circle className="pitch__spot" cx={centreX} cy={bottomSpotY} r={SPOT_RADIUS} />
      <path
        d={`M ${centreX - arcHalfWidth} ${PITCH_LENGTH - PENALTY_AREA_DEPTH} A ${r} ${r} 0 0 1 ${centreX + arcHalfWidth} ${PITCH_LENGTH - PENALTY_AREA_DEPTH}`}
      />

      {/* corner arcs, each centred on its corner flag */}
      <path d={`M ${c} 0 A ${c} ${c} 0 0 1 0 ${c}`} />
      <path d={`M ${PITCH_WIDTH - c} 0 A ${c} ${c} 0 0 0 ${PITCH_WIDTH} ${c}`} />
      <path d={`M 0 ${PITCH_LENGTH - c} A ${c} ${c} 0 0 1 ${c} ${PITCH_LENGTH}`} />
      <path
        d={`M ${PITCH_WIDTH - c} ${PITCH_LENGTH} A ${c} ${c} 0 0 1 ${PITCH_WIDTH} ${PITCH_LENGTH - c}`}
      />
    </g>
  );
}

function tapePath(width: number, height: number): string {
  const hw = width / 2;
  const hh = height / 2;
  const t = TAPE_TEAR;
  // straight long edges, zigzag torn ends
  return [
    `M ${-hw} ${-hh} L ${hw} ${-hh}`,
    `L ${hw - t} ${-hh / 2} L ${hw} 0 L ${hw - t} ${hh / 2} L ${hw} ${hh}`,
    `L ${-hw} ${hh}`,
    `L ${-hw + t} ${hh / 2} L ${-hw} 0 L ${-hw + t} ${-hh / 2} Z`,
  ].join(' ');
}

function squeezeTo(length: number | null) {
  return length === null
    ? {}
    : { textLength: length, lengthAdjust: 'spacingAndGlyphs' as const };
}

interface PlayerMarkerProps {
  player: PlacedPlayer;
  jerseyScale: number;
}

function PlayerMarker({ player, jerseyScale }: PlayerMarkerProps) {
  const tapeY =
    player.y + JERSEY_HALF_HEIGHT * jerseyScale + TAPE_GAP + TAPE_HEIGHT / 2;
  const tilt = (player.shirtNumber ?? 0) % 2 === 0 ? TAPE_TILT_DEG : -TAPE_TILT_DEG;

  return (
    <g className="pitch-player">
      <g
        className="pitch-player__jersey"
        transform={`translate(${player.x} ${player.y}) scale(${jerseyScale})`}
      >
        <Jersey
          kit={kitFor(player.teamShortName, player.position)}
          shirtNumber={player.shirtNumber}
          armband={player.armband}
        />
      </g>
      <g transform={`translate(${player.x} ${tapeY}) rotate(${tilt})`}>
        <path
          className="pitch-player__tape"
          d={tapePath(player.labelWidth + 2 * TAPE_PADDING_X, TAPE_HEIGHT)}
        />
        <text
          className="pitch-player__name"
          dy="0.36em"
          {...squeezeTo(player.labelLength)}
        >
          {player.name}
        </text>
      </g>
      <text
        className="pitch-player__fixture"
        x={player.x}
        y={tapeY + TAPE_HEIGHT / 2 + FIXTURE_BASELINE_GAP}
        {...squeezeTo(player.fixtureLength)}
      >
        {player.fixture}
      </text>
    </g>
  );
}

function PlayerList({
  heading,
  players,
}: {
  heading: string;
  players: PlacedPlayer[];
}) {
  if (players.length === 0) return null;
  return (
    <>
      {` ${heading}:`}
      <ul>
        {players.map((player) => (
          <li key={player.id}>
            {player.name}, number {player.shirtNumber}, {POSITION_NAME[player.position]}
            , {player.teamShortName},{' '}
            {player.fixture === 'Blank'
              ? 'no game this gameweek'
              : `plays ${player.fixture}`}
            {player.armband === 'captain' && ', captain'}
            {player.armband === 'vice' && ', vice-captain'}
          </li>
        ))}
      </ul>
    </>
  );
}
