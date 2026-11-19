/**
 * the eraser over the pitch during a refresh. it wipes the pitch clean, waits
 * for the new report, then either fades so the new pitch can draw itself in or,
 * if the refresh failed, wipes back to reveal the old one untouched
 */
export type EraserPhase =
  | 'idle'
  | 'wiping'
  /** the refresh ended mid-wipe; the wipe finishes before the outcome shows */
  | 'wiping-then-reveal'
  | 'wiping-then-restore'
  | 'erased'
  | 'revealing'
  | 'restoring';

export type EraserEvent =
  | 'refresh-started'
  | 'wipe-finished'
  | 'refresh-succeeded'
  | 'refresh-failed'
  | 'settled';

export function nextEraserPhase(phase: EraserPhase, event: EraserEvent): EraserPhase {
  switch (event) {
    case 'refresh-started':
      return 'wiping';
    case 'wipe-finished':
      if (phase === 'wiping') return 'erased';
      if (phase === 'wiping-then-reveal') return 'revealing';
      if (phase === 'wiping-then-restore') return 'restoring';
      return phase;
    case 'refresh-succeeded':
      if (phase === 'idle') return 'idle';
      // a quick refresh still gets the whole wipe before the new pitch shows
      return phase === 'wiping' ? 'wiping-then-reveal' : 'revealing';
    case 'refresh-failed':
      if (phase === 'idle') return 'idle';
      return phase === 'wiping' ? 'wiping-then-restore' : 'restoring';
    case 'settled':
      return phase === 'revealing' || phase === 'restoring' ? 'idle' : phase;
  }
}
