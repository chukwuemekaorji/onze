import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLUB_KITS,
  GOALKEEPER_KIT,
  KIT_FALLBACK,
  KIT_MUTE_AMOUNT,
  kitFor,
  mixColour,
  NUMBER_INK,
  NUMBER_PAPER,
  numberColourFor,
} from '../web/club-colours.js';
import { contrastRatio } from '../web/color-contrast.js';

const HEX_COLOUR = /^#[0-9a-f]{6}$/;
// numbers are large bold text, so wcag's 3:1 large-text bar applies
const MIN_NUMBER_CONTRAST = 3;

describe('kitFor', () => {
  const mutedKit = (kit: { primary: string; secondary: string }) => ({
    primary: mixColour(kit.primary, NUMBER_PAPER, KIT_MUTE_AMOUNT),
    secondary: mixColour(kit.secondary, NUMBER_PAPER, KIT_MUTE_AMOUNT),
  });

  it('returns the club kit for a known fpl short name, muted toward the paper', () => {
    expect(kitFor('ARS', 'MID')).toEqual(mutedKit(CLUB_KITS.ARS!));
  });

  it('ignores letter case in the short name', () => {
    expect(kitFor('mci', 'DEF')).toEqual(kitFor('MCI', 'DEF'));
  });

  it('falls back to the neutral kit for an unknown or empty team', () => {
    expect(kitFor('XYZ', 'FWD')).toEqual(mutedKit(KIT_FALLBACK));
    expect(kitFor('', 'MID')).toEqual(mutedKit(KIT_FALLBACK));
  });

  it('puts every goalkeeper in the keeper kit, whatever the club', () => {
    expect(kitFor('LIV', 'GK')).toEqual(mutedKit(GOALKEEPER_KIT));
    expect(kitFor('XYZ', 'GK')).toEqual(kitFor('LIV', 'GK'));
  });
});

describe('mixColour', () => {
  it('leaves a colour alone at 0 and lands on the target at 1', () => {
    expect(mixColour('#ef0107', '#f2ecdf', 0)).toBe('#ef0107');
    expect(mixColour('#ef0107', '#f2ecdf', 1)).toBe('#f2ecdf');
  });

  it('blends each channel part of the way', () => {
    expect(mixColour('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColour('#ef0107', '#f2ecdf', KIT_MUTE_AMOUNT)).toBe('#f03537');
  });
});

describe('kit table', () => {
  it('uses lowercase #rrggbb values throughout', () => {
    for (const kit of [...Object.values(CLUB_KITS), GOALKEEPER_KIT, KIT_FALLBACK]) {
      expect(kit.primary).toMatch(HEX_COLOUR);
      expect(kit.secondary).toMatch(HEX_COLOUR);
    }
  });

  it('keys clubs by three-letter uppercase short names', () => {
    for (const shortName of Object.keys(CLUB_KITS)) {
      expect(shortName).toMatch(/^[A-Z]{3}$/);
    }
  });
});

describe('numberColourFor', () => {
  it('puts ink on light shirts and paper on dark ones', () => {
    expect(numberColourFor(CLUB_KITS.TOT!)).toBe(NUMBER_INK);
    expect(numberColourFor(GOALKEEPER_KIT)).toBe(NUMBER_INK);
    expect(numberColourFor(CLUB_KITS.CHE!)).toBe(NUMBER_PAPER);
    expect(numberColourFor(CLUB_KITS.NEW!)).toBe(NUMBER_PAPER);
  });

  it('keeps every shirt number readable on the muted kits that are drawn', () => {
    const drawn = [
      ...Object.keys(CLUB_KITS).map((club) => kitFor(club, 'MID')),
      kitFor('LIV', 'GK'),
      kitFor('XYZ', 'MID'),
    ];
    for (const kit of drawn) {
      expect(contrastRatio(kit.primary, numberColourFor(kit))).toBeGreaterThanOrEqual(
        MIN_NUMBER_CONTRAST,
      );
    }
  });

  it('uses the same ink and paper as the design tokens', () => {
    const tokens = readFileSync(
      new URL('../web/styles/tokens.css', import.meta.url),
      'utf8',
    );
    expect(tokens).toContain(`--ink: ${NUMBER_INK};`);
    expect(tokens).toContain(`--paper: ${NUMBER_PAPER};`);
  });
});

describe('contrastRatio', () => {
  it('rejects a colour that is not #rrggbb', () => {
    expect(() => contrastRatio('red', '#ffffff')).toThrow(/#rrggbb/);
  });
});
