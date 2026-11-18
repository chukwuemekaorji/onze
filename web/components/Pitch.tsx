import { motion } from 'motion/react';
import type { AnalysisSummary } from '../../lib/analysis-summary.js';
import type { Position } from '../../lib/analysis/types.js';
import { kitFor } from '../club-colours.js';
import {
  JERSEY_FIRST_DELAY_S,
  JERSEY_SLAP_S,
  JERSEY_STAGGER_S,
  PITCH_DRAW_S,
  usePlayOnce,
} from '../motion.js';
import {
  benchInFplOrder,
  placeRow,
  placeStartingXI,
  shirtNumbers,
} from '../pitch-layout.js';
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

// the name chip under each jersey, in pitch units
const LABEL_GAP = 8;
const LABEL_HEIGHT = 34;
const LABEL_PADDING_X = 12;
const LABEL_RADIUS = 8;
const FIXTURE_BASELINE_GAP = 25;

const PITCH_ROW_LAYOUT: RowLayout = {
  width: PITCH_WIDTH,
  sideMargin: m(4),
  // these two mirror the font sizes in pitch.css
  labelFontSize: 24,
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
  const playEntrance = usePlayOnce('pitch');
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
  const bench = placeRow(
    benchInFplOrder(lineup.bench),
    BENCH_ROW_Y,
    PITCH_ROW_LAYOUT,
    context,
  );
  // shirts land in number order: keeper, defence, midfield, attack, then the bench
  const landingDelay = (player: PlacedPlayer) =>
    playEntrance
      ? JERSEY_FIRST_DELAY_S + ((player.shirtNumber ?? 1) - 1) * JERSEY_STAGGER_S
      : null;

  return (
    <figure className="pitch">
      <svg
        className="pitch__field"
        viewBox={`${-PITCH_BORDER} ${-PITCH_BORDER} ${PITCH_WIDTH + 2 * PITCH_BORDER} ${PITCH_LENGTH + 2 * PITCH_BORDER}`}
        aria-hidden="true"
        focusable="false"
      >
        <Grass />
        <Markings drawIn={playEntrance} />
        {starters.map((player) => (
          <PlayerMarker
            key={player.id}
            player={player}
            jerseyScale={PITCH_JERSEY_SCALE}
            entranceDelayS={landingDelay(player)}
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
            BENCH
          </text>
          {bench.map((player) => (
            <PlayerMarker
              key={player.id}
              player={player}
              jerseyScale={BENCH_JERSEY_SCALE}
              entranceDelayS={landingDelay(player)}
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

interface MarkingsProps {
  /** draw the lines in on first load */
  drawIn: boolean;
}

function Markings({ drawIn }: MarkingsProps) {
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
  // pathLength under the hood is a stroke-dashoffset animation
  const line = drawIn
    ? {
        initial: { pathLength: 0 },
        animate: { pathLength: 1 },
        transition: { duration: PITCH_DRAW_S, ease: 'easeInOut' as const },
      }
    : {};
  const spot = drawIn
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { delay: PITCH_DRAW_S / 2, duration: PITCH_DRAW_S / 2 },
      }
    : {};

  return (
    <g className="pitch__lines" filter={INK_WOBBLE_FILTER}>
      <motion.rect x={0} y={0} width={PITCH_WIDTH} height={PITCH_LENGTH} {...line} />
      <motion.line x1={0} y1={halfway} x2={PITCH_WIDTH} y2={halfway} {...line} />
      <motion.circle cx={centreX} cy={halfway} r={r} {...line} />
      <motion.circle
        className="pitch__spot"
        cx={centreX}
        cy={halfway}
        r={SPOT_RADIUS}
        {...spot}
      />

      {/* top end */}
      <motion.rect
        x={penaltyAreaLeft}
        y={0}
        width={PENALTY_AREA_WIDTH}
        height={PENALTY_AREA_DEPTH}
        {...line}
      />
      <motion.rect
        x={goalAreaLeft}
        y={0}
        width={GOAL_AREA_WIDTH}
        height={GOAL_AREA_DEPTH}
        {...line}
      />
      <motion.circle
        className="pitch__spot"
        cx={centreX}
        cy={topSpotY}
        r={SPOT_RADIUS}
        {...spot}
      />
      <motion.path
        d={`M ${centreX - arcHalfWidth} ${PENALTY_AREA_DEPTH} A ${r} ${r} 0 0 0 ${centreX + arcHalfWidth} ${PENALTY_AREA_DEPTH}`}
        {...line}
      />

      {/* bottom end */}
      <motion.rect
        x={penaltyAreaLeft}
        y={PITCH_LENGTH - PENALTY_AREA_DEPTH}
        width={PENALTY_AREA_WIDTH}
        height={PENALTY_AREA_DEPTH}
        {...line}
      />
      <motion.rect
        x={goalAreaLeft}
        y={PITCH_LENGTH - GOAL_AREA_DEPTH}
        width={GOAL_AREA_WIDTH}
        height={GOAL_AREA_DEPTH}
        {...line}
      />
      <motion.circle
        className="pitch__spot"
        cx={centreX}
        cy={bottomSpotY}
        r={SPOT_RADIUS}
        {...spot}
      />
      <motion.path
        d={`M ${centreX - arcHalfWidth} ${PITCH_LENGTH - PENALTY_AREA_DEPTH} A ${r} ${r} 0 0 1 ${centreX + arcHalfWidth} ${PITCH_LENGTH - PENALTY_AREA_DEPTH}`}
        {...line}
      />

      {/* corner arcs, each centred on its corner flag */}
      <motion.path d={`M ${c} 0 A ${c} ${c} 0 0 1 0 ${c}`} {...line} />
      <motion.path
        d={`M ${PITCH_WIDTH - c} 0 A ${c} ${c} 0 0 0 ${PITCH_WIDTH} ${c}`}
        {...line}
      />
      <motion.path
        d={`M 0 ${PITCH_LENGTH - c} A ${c} ${c} 0 0 1 ${c} ${PITCH_LENGTH}`}
        {...line}
      />
      <motion.path
        d={`M ${PITCH_WIDTH - c} ${PITCH_LENGTH} A ${c} ${c} 0 0 1 ${PITCH_WIDTH} ${PITCH_LENGTH - c}`}
        {...line}
      />
    </g>
  );
}

function squeezeTo(length: number | null) {
  return length === null
    ? {}
    : { textLength: length, lengthAdjust: 'spacingAndGlyphs' as const };
}

interface PlayerMarkerProps {
  player: PlacedPlayer;
  jerseyScale: number;
  /** when this shirt lands, or null to show it in place straight away */
  entranceDelayS: number | null;
}

// each shirt settles into place: a touch large, a hint of give, then still
const SLAP_START_SCALE = 1.08;
const SLAP_SQUASH_SCALE = 0.99;

function PlayerMarker({ player, jerseyScale, entranceDelayS }: PlayerMarkerProps) {
  const labelY = JERSEY_HALF_HEIGHT * jerseyScale + LABEL_GAP + LABEL_HEIGHT / 2;
  const labelWidth = player.labelWidth + 2 * LABEL_PADDING_X;
  const landing =
    entranceDelayS === null
      ? {}
      : {
          initial: { opacity: 0, scale: SLAP_START_SCALE },
          animate: {
            opacity: [0, 1, 1],
            scale: [SLAP_START_SCALE, SLAP_SQUASH_SCALE, 1],
          },
          transition: {
            delay: entranceDelayS,
            duration: JERSEY_SLAP_S,
            times: [0, 0.6, 1],
            ease: 'easeOut' as const,
          },
        };

  // the outer group places the player with an svg transform; the inner one
  // carries motion's css transform, which would otherwise replace it
  return (
    <g className="pitch-player" transform={`translate(${player.x} ${player.y})`}>
      <motion.g className="pitch-player__landing" {...landing}>
        <g className="pitch-player__jersey" transform={`scale(${jerseyScale})`}>
          <Jersey
            kit={kitFor(player.teamShortName, player.position)}
            shirtNumber={player.shirtNumber}
            armband={player.armband}
          />
        </g>
        <g transform={`translate(0 ${labelY})`}>
          <rect
            className="pitch-player__label-bg"
            x={-labelWidth / 2}
            y={-LABEL_HEIGHT / 2}
            width={labelWidth}
            height={LABEL_HEIGHT}
            rx={LABEL_RADIUS}
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
          x={0}
          y={labelY + LABEL_HEIGHT / 2 + FIXTURE_BASELINE_GAP}
          {...squeezeTo(player.fixtureLength)}
        >
          {player.fixture}
        </text>
      </motion.g>
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
