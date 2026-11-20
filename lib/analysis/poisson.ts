/**
 * counts in a match (goals, assists, goals conceded, saves) are treated as
 * poisson: independent events at a steady rate. it's the standard first
 * assumption for football scores and slightly understates big hauls, since
 * real goals cluster a little more than poisson allows
 */

// far enough into the tail that what's left is below 1e-12 for any match-sized mean
const TAIL_SPREADS = 12;
const TAIL_MINIMUM = 20;

/** chance of none at all */
export function poissonZero(mean: number): number {
  assertMean(mean);
  return Math.exp(-mean);
}

/**
 * expected value of floor(count / divisor): fpl's "1 point per 3 saves" and
 * "-1 per 2 goals conceded" are steps, so the mean count alone isn't enough
 */
export function poissonExpectedFloor(mean: number, divisor: number): number {
  assertMean(mean);
  if (!Number.isInteger(divisor) || divisor < 1) {
    throw new Error(`divisor must be a whole number from 1, got ${divisor}`);
  }
  if (mean === 0) return 0;
  const last = Math.ceil(mean + TAIL_SPREADS * Math.sqrt(mean) + TAIL_MINIMUM);
  let probability = Math.exp(-mean);
  let expected = 0;
  for (let count = 1; count <= last; count += 1) {
    probability *= mean / count;
    expected += probability * Math.floor(count / divisor);
  }
  return expected;
}

function assertMean(mean: number): void {
  if (!Number.isFinite(mean) || mean < 0) {
    throw new Error(`a poisson mean must be finite and at least 0, got ${mean}`);
  }
}
