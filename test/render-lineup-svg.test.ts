import { describe, it, expect } from 'vitest';
import { renderLineupSvg } from '../lib/render-lineup-svg.js';
import { makePlayer } from './helpers/fixtures.js';
import type { LineupAnalysis } from '../lib/analysis/lineup.js';

describe('renderLineupSvg', () => {
  it('renders valid SVG containing every starting player and bench player by name', () => {
    const gk = makePlayer({ id: 1, webName: 'Kelleher', position: 'GK' });
    const def = makePlayer({ id: 2, webName: 'Gvardiol', position: 'DEF' });
    const mid = makePlayer({ id: 3, webName: 'Palmer', position: 'MID' });
    const fwd = makePlayer({ id: 4, webName: 'Haaland', position: 'FWD' });
    const benchPlayer = makePlayer({ id: 5, webName: 'Button', position: 'GK' });

    const lineup: LineupAnalysis = {
      formation: '1-1-1',
      startingXI: [
        { player: gk, score: 5 },
        { player: def, score: 5 },
        { player: mid, score: 5 },
        { player: fwd, score: 5 },
      ],
      bench: [{ player: benchPlayer, score: 1 }],
    };

    const svg = renderLineupSvg(lineup, { teamName: 'Solio Moose', event: 3 });

    expect(svg.startsWith('<svg')).toBe(true);
    for (const name of ['Kelleher', 'Gvardiol', 'Palmer', 'Haaland', 'Button', 'Solio Moose']) {
      expect(svg).toContain(name);
    }
  });

  it('escapes XML-unsafe characters in names', () => {
    const player = makePlayer({ id: 1, webName: 'O&Reilly<script>', position: 'GK' });
    const lineup: LineupAnalysis = {
      formation: '0-0-0',
      startingXI: [{ player, score: 1 }],
      bench: [],
    };

    const svg = renderLineupSvg(lineup, { teamName: 'Team', event: 1 });

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('O&amp;Reilly&lt;script&gt;');
  });

  it('renders an empty pitch without crashing when the lineup is empty', () => {
    const lineup: LineupAnalysis = { formation: '0-0-0', startingXI: [], bench: [] };

    const svg = renderLineupSvg(lineup, { teamName: 'Empty', event: 1 });

    expect(svg.startsWith('<svg')).toBe(true);
  });
});
