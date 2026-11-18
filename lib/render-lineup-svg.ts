/**
 * Renders a recommended lineup as an SVG pitch graphic. Pure string
 * templating, no rendering dependencies here — api/lineup-image.ts
 * converts the SVG to PNG at the I/O boundary.
 */

import type { LineupAnalysis, LineupPlayer } from './analysis/lineup.js';
import type { Position } from './analysis/types.js';

export interface RenderLineupOptions {
  teamName: string;
  event: number;
}

const WIDTH = 900;
const TITLE_Y = 55;
const PITCH_TOP = 100;
const PITCH_HEIGHT = 680;
const PITCH_BOTTOM = PITCH_TOP + PITCH_HEIGHT;
const BENCH_LABEL_Y = PITCH_BOTTOM + 45;
const BENCH_ROW_Y = PITCH_BOTTOM + 95;
const HEIGHT = BENCH_ROW_Y + 70;

const POSITION_COLOR: Record<Position, string> = {
  GK: '#f5a623',
  DEF: '#3d7dca',
  MID: '#2ecc71',
  FWD: '#e74c3c',
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`;
}

function playerCard(x: number, y: number, entry: LineupPlayer): string {
  const color = POSITION_COLOR[entry.player.position];
  const name = escapeXml(entry.player.webName);
  const sub = escapeXml(
    `${entry.player.teamShortName} · ${formatMoney(entry.player.nowCost)}`,
  );
  return `<g>
    <rect x="${x - 72}" y="${y - 34}" width="144" height="68" rx="12" fill="${color}" opacity="0.92" />
    <text x="${x}" y="${y - 8}" text-anchor="middle" font-size="16" font-weight="700" fill="#ffffff" font-family="Arial, sans-serif">${name}</text>
    <text x="${x}" y="${y + 14}" text-anchor="middle" font-size="12" fill="#ffffff" font-family="Arial, sans-serif" opacity="0.9">${sub}</text>
  </g>`;
}

function layoutRow(count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [WIDTH / 2];
  const margin = 100;
  const usableWidth = WIDTH - margin * 2;
  return Array.from(
    { length: count },
    (_, i) => margin + (usableWidth / (count - 1)) * i,
  );
}

function playersByPosition(players: LineupPlayer[], position: Position): LineupPlayer[] {
  return players.filter((p) => p.player.position === position);
}

export function renderLineupSvg(
  lineup: LineupAnalysis,
  options: RenderLineupOptions,
): string {
  const rows: Array<{ players: LineupPlayer[]; y: number }> = [
    { players: playersByPosition(lineup.startingXI, 'FWD'), y: PITCH_TOP + PITCH_HEIGHT * 0.14 },
    { players: playersByPosition(lineup.startingXI, 'MID'), y: PITCH_TOP + PITCH_HEIGHT * 0.4 },
    { players: playersByPosition(lineup.startingXI, 'DEF'), y: PITCH_TOP + PITCH_HEIGHT * 0.66 },
    { players: playersByPosition(lineup.startingXI, 'GK'), y: PITCH_TOP + PITCH_HEIGHT * 0.9 },
  ];

  const rowsSvg = rows
    .map(({ players, y }) => {
      const xs = layoutRow(players.length);
      return players.map((p, i) => playerCard(xs[i]!, y, p)).join('');
    })
    .join('');

  const benchXs = layoutRow(lineup.bench.length);
  const benchSvg = lineup.bench
    .map((p, i) => playerCard(benchXs[i]!, BENCH_ROW_Y, p))
    .join('');

  const title = escapeXml(
    `${options.teamName} · GW${options.event} · ${lineup.formation}`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#0b1d0f" />
    <text x="${WIDTH / 2}" y="${TITLE_Y}" text-anchor="middle" font-size="28" font-weight="800" fill="#ffffff" font-family="Arial, sans-serif">${title}</text>

    <rect x="40" y="${PITCH_TOP}" width="${WIDTH - 80}" height="${PITCH_HEIGHT}" rx="16" fill="#1e7a34" />
    <rect x="40" y="${PITCH_TOP}" width="${WIDTH - 80}" height="${PITCH_HEIGHT}" rx="16" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3" />
    <line x1="40" y1="${PITCH_TOP + PITCH_HEIGHT / 2}" x2="${WIDTH - 40}" y2="${PITCH_TOP + PITCH_HEIGHT / 2}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" />
    <circle cx="${WIDTH / 2}" cy="${PITCH_TOP + PITCH_HEIGHT / 2}" r="70" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" />

    ${rowsSvg}

    <text x="${WIDTH / 2}" y="${BENCH_LABEL_Y}" text-anchor="middle" font-size="18" font-weight="700" fill="#ffffff" font-family="Arial, sans-serif" opacity="0.85">BENCH</text>
    ${benchSvg}
  </svg>`;
}
