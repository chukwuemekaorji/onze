import type { Position } from '../lib/analysis/types.js';
import { mostReadable } from './color-contrast.js';

// svg fills need real values to compare, so these mirror --ink and --paper in
// tokens.css (test/club-colours.test.ts keeps them in step)
export const NUMBER_INK = '#1b1a17';
export const NUMBER_PAPER = '#f2ecdf';

export interface KitColours {
  /** shirt body */
  primary: string;
  /** sleeves and collar */
  secondary: string;
}

// home kits, simplified to two colours. keyed by fpl's team short_name, which is
// stable across seasons. clubs with one-colour shirts get a darker shade of it
// as the secondary, so sleeves still read as sleeves. promoted clubs missing
// here fall back to KIT_FALLBACK until added
export const CLUB_KITS: Readonly<Record<string, KitColours>> = {
  ARS: { primary: '#ef0107', secondary: '#ffffff' },
  AVL: { primary: '#670e36', secondary: '#95bfe5' },
  BOU: { primary: '#da291c', secondary: '#1a1a1a' },
  BRE: { primary: '#e30613', secondary: '#ffffff' },
  BHA: { primary: '#0057b8', secondary: '#ffffff' },
  BUR: { primary: '#6c1d45', secondary: '#99d6ea' },
  CHE: { primary: '#034694', secondary: '#022f63' },
  CRY: { primary: '#1b458f', secondary: '#c4122e' },
  EVE: { primary: '#003399', secondary: '#00267a' },
  FUL: { primary: '#ffffff', secondary: '#1a1a1a' },
  IPS: { primary: '#3a64a3', secondary: '#ffffff' },
  LEE: { primary: '#ffffff', secondary: '#1d428a' },
  LEI: { primary: '#003090', secondary: '#fdbe11' },
  LIV: { primary: '#c8102e', secondary: '#9b0c23' },
  LUT: { primary: '#f78f1e', secondary: '#002d62' },
  MCI: { primary: '#6cabdd', secondary: '#1c2c5b' },
  MUN: { primary: '#da291c', secondary: '#a51d14' },
  NEW: { primary: '#241f20', secondary: '#ffffff' },
  NFO: { primary: '#dd0000', secondary: '#a30000' },
  NOR: { primary: '#fff200', secondary: '#00a650' },
  SHU: { primary: '#ee2737', secondary: '#ffffff' },
  SOU: { primary: '#d71920', secondary: '#ffffff' },
  SUN: { primary: '#eb172b', secondary: '#ffffff' },
  TOT: { primary: '#ffffff', secondary: '#132257' },
  WAT: { primary: '#fbee23', secondary: '#ed2127' },
  WHU: { primary: '#7a263a', secondary: '#1bb1e7' },
  WOL: { primary: '#fdb913', secondary: '#231f20' },
};

// keepers wear one fixed kit so they stand out from every outfield shirt
export const GOALKEEPER_KIT: KitColours = { primary: '#f6d94a', secondary: '#1b1a17' };

// plain paper and muted ink, so an unknown club looks deliberate, not broken
export const KIT_FALLBACK: KitColours = { primary: '#e8e2d3', secondary: '#5a554c' };

/** ink or paper, whichever reads better on the shirt body */
export function numberColourFor(kit: KitColours): string {
  return mostReadable(kit.primary, [NUMBER_INK, NUMBER_PAPER]);
}

export function kitFor(teamShortName: string, position: Position): KitColours {
  if (position === 'GK') return GOALKEEPER_KIT;
  return CLUB_KITS[teamShortName.toUpperCase()] ?? KIT_FALLBACK;
}
