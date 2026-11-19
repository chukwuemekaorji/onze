import { motion } from 'motion/react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { AnalysisSummary } from '../../lib/analysis-summary.js';
import type { AnalysisPlayer, Position } from '../../lib/analysis/types.js';
import { kitFor } from '../club-colours.js';
import {
  JERSEY_FIRST_DELAY_S,
  JERSEY_SLAP_S,
  JERSEY_STAGGER_S,
  PITCH_DRAW_S,
  SWAP_S,
  SWAP_TIMES,
  usePlayOnce,
  usePrefersReducedMotion,
} from '../motion.js';
import {
  benchInFplOrder,
  estimateLabelWidth,
  HAND_GLYPH_WIDTH_EM,
  incomingNote,
  incomingTransfers,
  placeRow,
  transferPairs,
  placeStartingXI,
  shirtNumbers,
} from '../pitch-layout.js';
import type { PlacedPlayer, PlacementContext, RowLayout } from '../pitch-layout.js';
import { useReportStage } from '../report-stage.js';
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

// the masking tape name label under each jersey, in pitch units
const LABEL_GAP = 8;
const LABEL_HEIGHT = 34;
const LABEL_PADDING_X = 12;
// how far a torn tape end bites into the strip
const TAPE_TEAR = 4;
// the red marker ring round a new arrival, and the note above it
const RING_RADIUS_X = 46;
const RING_RADIUS_Y = 42;
const NOTE_GAP = 14;
// the hand-drawn ring bulges to about this fraction of its radius at the side
const SWAP_BUTTON_RING_EDGE = 0.9;
const RING_DRAW_S = 0.6;
// where the formation is scribbled, in the top left corner of the pitch
const FORMATION_X = m(3);
const FORMATION_Y = m(7);
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
// room above the bench row for an "in for" note
const BENCH_HEIGHT = 228;
const BENCH_ROW_Y = 92;

const POSITION_NAME: Record<Position, string> = {
  GK: 'goalkeeper',
  DEF: 'defender',
  MID: 'midfielder',
  FWD: 'forward',
};

interface PitchProps {
  summary: AnalysisSummary;
  /** names the entrance, so a second pitch on another page plays its own */
  entranceKey?: string;
}

// a swap asked for from another tab waits for the page to settle first
const QUEUED_SWAP_DELAY_S = 0.4;
// hover lift tilts toward the pointer by up to this much
const LIFT_MAX_TILT_DEG = 6;

interface SwapRun {
  playerId: number;
  /** bumped per play, so the same swap can be replayed */
  run: number;
}

const fieldViewBox = {
  x: -PITCH_BORDER,
  y: -PITCH_BORDER,
  width: PITCH_WIDTH + 2 * PITCH_BORDER,
  height: PITCH_LENGTH + 2 * PITCH_BORDER,
};
const benchViewBox = {
  x: -PITCH_BORDER,
  y: 0,
  width: PITCH_WIDTH + 2 * PITCH_BORDER,
  height: BENCH_HEIGHT,
};
type ViewBox = typeof fieldViewBox;
const viewBoxAttr = (box: ViewBox) => `${box.x} ${box.y} ${box.width} ${box.height}`;

export function Pitch({ summary, entranceKey = 'pitch' }: PitchProps) {
  const playEntrance = usePlayOnce(entranceKey);
  const reduced = usePrefersReducedMotion();
  const stage = useReportStage();
  const [swap, setSwap] = useState<SwapRun | null>(null);
  const [focusedSwapId, setFocusedSwapId] = useState<number | null>(null);
  const { lineup, captaincy } = summary;
  const pairs = transferPairs(summary.transfers);

  function playSwap(playerId: number): void {
    setSwap((previous) => ({ playerId, run: (previous?.run ?? 0) + 1 }));
  }

  // a swap the transfers tab asked for plays once this pitch is on screen,
  // after its own entrance if that's still running. the timer lives in a ref:
  // clearing the request re-runs the effect, which mustn't cancel it
  const queuedSwapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startQueuedSwap = useEffectEvent(() => {
    const playerId = stage.pendingSwapId;
    if (playerId === null) return;
    stage.clearPendingSwap();
    if (!pairs.has(playerId)) return;
    const lastLanding = JERSEY_FIRST_DELAY_S + 15 * JERSEY_STAGGER_S + JERSEY_SLAP_S;
    const delayS = playEntrance ? lastLanding : QUEUED_SWAP_DELAY_S;
    queuedSwapTimer.current = setTimeout(() => playSwap(playerId), delayS * 1000);
  });
  useEffect(() => startQueuedSwap(), [stage.pendingSwapId]);
  useEffect(
    () => () => {
      if (queuedSwapTimer.current !== null) clearTimeout(queuedSwapTimer.current);
    },
    [],
  );

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
    incoming: incomingTransfers(summary.transfers),
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

  const markerFor = (player: PlacedPlayer, jerseyScale: number) => (
    <PlayerMarker
      key={player.id}
      player={player}
      jerseyScale={jerseyScale}
      entranceDelayS={landingDelay(player)}
      swapRun={swap?.playerId === player.id ? swap.run : 0}
      outgoing={pairs.get(player.id) ?? null}
      lifted={focusedSwapId === player.id}
      reduced={reduced}
    />
  );
  const swapButtonsFor = (
    players: PlacedPlayer[],
    box: ViewBox,
    jerseyScale: number,
  ) => (
    <SwapButtons
      players={players.filter((p) => p.incomingFor !== null)}
      box={box}
      jerseyScale={jerseyScale}
      onPlay={playSwap}
      onFocusChange={setFocusedSwapId}
    />
  );

  return (
    <figure className="pitch">
      <div className="pitch__layer">
        <svg
          className="pitch__field"
          viewBox={viewBoxAttr(fieldViewBox)}
          aria-hidden="true"
          focusable="false"
        >
          <Grass />
          <Markings drawIn={playEntrance} />
          {lineup.formation && (
            <motion.text
              className="pitch__formation"
              x={FORMATION_X}
              y={FORMATION_Y}
              {...(playEntrance && {
                initial: { opacity: 0 },
                animate: { opacity: 1 },
                transition: { delay: PITCH_DRAW_S, duration: 0.4 },
              })}
            >
              {lineup.formation}
            </motion.text>
          )}
          {starters.map((player) => markerFor(player, PITCH_JERSEY_SCALE))}
        </svg>
        {swapButtonsFor(starters, fieldViewBox, PITCH_JERSEY_SCALE)}
      </div>

      {bench.length > 0 && (
        <div className="pitch__layer">
          <svg
            className="pitch__bench"
            viewBox={viewBoxAttr(benchViewBox)}
            aria-hidden="true"
            focusable="false"
          >
            <text className="pitch__bench-label" x={0} y={22}>
              BENCH
            </text>
            {bench.map((player) => markerFor(player, BENCH_JERSEY_SCALE))}
          </svg>
          {swapButtonsFor(bench, benchViewBox, BENCH_JERSEY_SCALE)}
        </div>
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

interface SwapButtonsProps {
  players: PlacedPlayer[];
  box: ViewBox;
  jerseyScale: number;
  onPlay: (playerId: number) => void;
  onFocusChange: (playerId: number | null) => void;
}

/**
 * real buttons over the drawing, one per new arrival. the svg is hidden from
 * screen readers, so the controls live in html on top, placed in percentages
 * of the viewbox so they track the drawing at any size
 */
function SwapButtons({
  players,
  box,
  jerseyScale,
  onPlay,
  onFocusChange,
}: SwapButtonsProps) {
  if (players.length === 0) return null;
  // on the ring's right edge, level with the shirt: clear of the note above,
  // the name below and the arrow, which runs round the left
  const offsetX = RING_RADIUS_X * jerseyScale * SWAP_BUTTON_RING_EDGE;
  const offsetY = 0;
  return (
    <div className="pitch__controls">
      {players.map((player) => (
        <button
          key={player.id}
          type="button"
          className="swap-button"
          // geometry measured from the layout; set through the cssom, which the csp allows
          style={{
            left: `${((player.x + offsetX - box.x) / box.width) * 100}%`,
            top: `${((player.y + offsetY - box.y) / box.height) * 100}%`,
          }}
          aria-label={`Show the swap: ${player.name} in for ${player.incomingFor ?? ''}`}
          onClick={() => onPlay(player.id)}
          // only keyboard focus lifts the jersey; a click already has the pointer on it
          onFocus={(event) => {
            if (event.currentTarget.matches(':focus-visible')) onFocusChange(player.id);
          }}
          onBlur={() => onFocusChange(null)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M3 5.5h9l-2.5-2.5M13 10.5H4l2.5 2.5" />
          </svg>
        </button>
      ))}
    </div>
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

// the swap plays as keyframes on the two jerseys, timed by SWAP_TIMES. the new
// jersey peels up and away, waits, then slaps back; the old one does the reverse
const t = SWAP_TIMES;
const PEEL_LIFT = -26;
const PEEL_TILT_DEG = -12;
const PEEL_SCALE = 0.88;
const SLAP_SCALE = 1.22;

const incomingSwapMotion = {
  initial: { opacity: 1, y: 0, rotate: 0, scale: 1 },
  animate: {
    opacity: [1, 0, 0, 0, 1],
    y: [0, PEEL_LIFT, PEEL_LIFT, 0, 0],
    rotate: [0, PEEL_TILT_DEG, PEEL_TILT_DEG, 0, 0],
    scale: [1, PEEL_SCALE, PEEL_SCALE, SLAP_SCALE, 1],
  },
  transition: {
    duration: SWAP_S,
    times: [0, t.inPeeled, t.inReturns - 0.001, t.inReturns, t.inLanded],
    ease: 'easeOut' as const,
  },
};

const outgoingSwapMotion = {
  initial: { opacity: 0, y: 0, rotate: 0, scale: SLAP_SCALE },
  animate: {
    opacity: [0, 0, 1, 1, 0],
    y: [0, 0, 0, 0, PEEL_LIFT],
    rotate: [0, 0, 0, 0, PEEL_TILT_DEG],
    scale: [SLAP_SCALE, SLAP_SCALE, 1, 1, PEEL_SCALE],
  },
  transition: {
    duration: SWAP_S,
    times: [0, t.inPeeled, t.outLanded, t.outLifts, t.outPeeled],
    ease: 'easeOut' as const,
  },
};

const swapArrowMotion = {
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: [0, 0, 1], opacity: [0, 1, 1] },
  transition: {
    duration: SWAP_S,
    times: [0, t.arrowStarts, 1],
    ease: 'easeInOut' as const,
  },
};

// the arrow keeps this far outside the ring and off the note and tape ends
const SWAP_ARROW_RING_CLEARANCE = 34;
const SWAP_ARROW_END_GAP = 8;
// the shaft comes in level, so a symmetric open head reads as an arrow, not a tick
const SWAP_ARROW_HEAD_LENGTH = 14;
const SWAP_ARROW_HEAD_SPREAD = 10;
// the note's text sits about a third of its size above its baseline
const NOTE_MIDLINE_RISE = PITCH_ROW_LAYOUT.labelFontSize * 0.35;

interface SwapArrowGeometry {
  ringX: number;
  ringY: number;
  noteWidth: number;
  labelWidth: number;
  labelY: number;
}

/** from the left end of the "in for" note, wide round the left of the ring, into the new name */
function swapArrowPath({
  ringX,
  ringY,
  noteWidth,
  labelWidth,
  labelY,
}: SwapArrowGeometry): string {
  const startX = -noteWidth / 2 - SWAP_ARROW_END_GAP;
  const startY = -(ringY + NOTE_GAP) - NOTE_MIDLINE_RISE;
  const endX = -labelWidth / 2 - SWAP_ARROW_END_GAP;
  const endY = labelY;
  // always swing out past the ring and back in toward the tape
  const bendX = Math.min(
    -ringX - SWAP_ARROW_RING_CLEARANCE,
    startX - SWAP_ARROW_RING_CLEARANCE,
    endX - SWAP_ARROW_RING_CLEARANCE,
  );
  const headX = endX - SWAP_ARROW_HEAD_LENGTH;
  return [
    `M ${startX} ${startY}`,
    `C ${bendX} ${startY}, ${bendX} ${endY}, ${endX} ${endY}`,
    `M ${headX} ${endY - SWAP_ARROW_HEAD_SPREAD} L ${endX} ${endY} L ${headX} ${endY + SWAP_ARROW_HEAD_SPREAD}`,
  ].join(' ');
}

// pointer only: the jersey leans toward the side the pointer is on, like a
// sticker being picked up by that corner. touch never fires a hover move
function tiltToward(event: PointerEvent<SVGGElement>, lift: SVGGElement | null): void {
  if (event.pointerType !== 'mouse' || !lift) return;
  const box = lift.getBoundingClientRect();
  if (box.width === 0) return;
  const side = (event.clientX - (box.left + box.width / 2)) / (box.width / 2);
  const tilt = Math.max(-1, Math.min(1, side)) * LIFT_MAX_TILT_DEG;
  // a css variable set through the cssom, which the csp allows
  lift.style.setProperty('--lift-tilt', `${tilt.toFixed(1)}deg`);
}

interface PlayerMarkerProps {
  player: PlacedPlayer;
  jerseyScale: number;
  /** when this shirt lands, or null to show it in place straight away */
  entranceDelayS: number | null;
  /** 0 until the swap is played; bumped to replay it */
  swapRun: number;
  /** the player this one replaces, when it's a recommended arrival */
  outgoing: AnalysisPlayer | null;
  /** lifted because its swap button has keyboard focus */
  lifted: boolean;
  reduced: boolean;
}

// each shirt settles into place: a touch large, a hint of give, then still
const SLAP_START_SCALE = 1.25;
const SLAP_SQUASH_SCALE = 0.95;
// it lands a little crooked and is pressed flat; nothing stays tilted
const SLAP_TILT_DEG = 6;

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

/** a loose marker loop that overshoots where it started, like a coach's ring */
function ringPath(rx: number, ry: number): string {
  return [
    `M ${0.3 * rx} ${-ry}`,
    `C ${1.12 * rx} ${-0.98 * ry}, ${1.14 * rx} ${0.92 * ry}, ${0.05 * rx} ${ry}`,
    `C ${-1.1 * rx} ${1.05 * ry}, ${-1.16 * rx} ${-0.9 * ry}, ${-0.15 * rx} ${-1.04 * ry}`,
    `C ${0.2 * rx} ${-1.08 * ry}, ${0.55 * rx} ${-0.95 * ry}, ${0.72 * rx} ${-0.78 * ry}`,
  ].join(' ');
}

function PlayerMarker({
  player,
  jerseyScale,
  entranceDelayS,
  swapRun,
  outgoing,
  lifted,
  reduced,
}: PlayerMarkerProps) {
  const liftRef = useRef<SVGGElement>(null);
  const labelY = JERSEY_HALF_HEIGHT * jerseyScale + LABEL_GAP + LABEL_HEIGHT / 2;
  const labelWidth = player.labelWidth + 2 * LABEL_PADDING_X;
  const slapTilt = (player.shirtNumber ?? 0) % 2 === 0 ? SLAP_TILT_DEG : -SLAP_TILT_DEG;
  const landing =
    entranceDelayS === null
      ? {}
      : {
          initial: { opacity: 0, scale: SLAP_START_SCALE, rotate: slapTilt },
          animate: {
            opacity: [0, 1, 1],
            scale: [SLAP_START_SCALE, SLAP_SQUASH_SCALE, 1],
            rotate: [slapTilt, 0, 0],
          },
          transition: {
            delay: entranceDelayS,
            duration: JERSEY_SLAP_S,
            times: [0, 0.6, 1],
            ease: 'easeOut' as const,
          },
        };

  // the ring draws itself once the shirt has landed
  const ringDelay = entranceDelayS === null ? null : entranceDelayS + JERSEY_SLAP_S;
  const ringDraw =
    ringDelay === null
      ? {}
      : {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: {
            pathLength: {
              delay: ringDelay,
              duration: RING_DRAW_S,
              ease: 'easeInOut' as const,
            },
            opacity: { delay: ringDelay, duration: 0.01 },
          },
        };
  const noteFade =
    ringDelay === null
      ? {}
      : {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { delay: ringDelay + RING_DRAW_S / 2, duration: 0.3 },
        };
  const ringX = RING_RADIUS_X * jerseyScale;
  const ringY = RING_RADIUS_Y * jerseyScale;

  // the outer group places the player with an svg transform; the inner one
  // carries motion's css transform, which would otherwise replace it
  return (
    <g
      className={`pitch-player${lifted ? ' pitch-player--lifted' : ''}`}
      transform={`translate(${player.x} ${player.y})`}
      onPointerMove={(event) => tiltToward(event, liftRef.current)}
    >
      <motion.g className="pitch-player__landing" {...landing}>
        <g ref={liftRef} className="pitch-player__lift">
          <motion.g
            key={`in-${swapRun}`}
            className="pitch-player__swap"
            {...(swapRun > 0 && !reduced ? incomingSwapMotion : {})}
          >
            <g className="pitch-player__jersey" transform={`scale(${jerseyScale})`}>
              <Jersey
                kit={kitFor(player.teamShortName, player.position)}
                shirtNumber={player.shirtNumber}
                armband={player.armband}
              />
            </g>
          </motion.g>
          {swapRun > 0 && outgoing !== null && !reduced && (
            <motion.g
              key={`out-${swapRun}`}
              className="pitch-player__swap"
              {...outgoingSwapMotion}
            >
              <g className="pitch-player__jersey" transform={`scale(${jerseyScale})`}>
                <Jersey
                  kit={kitFor(outgoing.teamShortName, outgoing.position)}
                  shirtNumber={player.shirtNumber}
                  armband={null}
                />
              </g>
            </motion.g>
          )}
        </g>
        <g transform={`translate(0 ${labelY})`}>
          <path className="pitch-player__tape" d={tapePath(labelWidth, LABEL_HEIGHT)} />
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
      {player.incomingFor !== null && (
        <g className="pitch-player__arrival">
          <motion.path
            className="pitch-player__ring"
            d={ringPath(ringX, ringY)}
            filter={INK_WOBBLE_FILTER}
            {...ringDraw}
          />
          <motion.text
            className="pitch-player__note"
            y={-(ringY + NOTE_GAP)}
            {...squeezeTo(player.incomingNoteLength)}
            {...noteFade}
          >
            {incomingNote(player.incomingFor)}
          </motion.text>
          {swapRun > 0 && (
            <motion.path
              key={`arrow-${swapRun}`}
              className="pitch-player__swap-arrow"
              d={swapArrowPath({
                ringX,
                ringY,
                noteWidth:
                  player.incomingNoteLength ??
                  estimateLabelWidth(
                    incomingNote(player.incomingFor),
                    PITCH_ROW_LAYOUT.labelFontSize,
                    HAND_GLYPH_WIDTH_EM,
                  ),
                labelWidth,
                labelY,
              })}
              // no ink wobble: its filter region is measured from the player's
              // origin and would clip the arrow where it swings wide of the ring
              {...(reduced ? {} : swapArrowMotion)}
            />
          )}
        </g>
      )}
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
