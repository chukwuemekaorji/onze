/**
 * the two small fits the projection needs, in plain typescript: ridge
 * regression for points if playing, and l2 logistic regression for the chance
 * of playing. a dozen features and tens of thousands of rows, so a direct
 * solve is fast and needs no library
 */

export interface Example<K extends string> {
  features: Readonly<Record<K, number>>;
  target: number;
}

export interface FitOptions<K extends string> {
  keys: readonly K[];
  /** l2 penalty; 0 is ordinary least squares */
  penalty: number;
  /** features the penalty leaves alone, such as intercepts */
  unpenalised: readonly K[];
}

/** least squares with an l2 penalty: solves (X'X + penalty x I) w = X'y */
export function fitRidge<K extends string>(
  examples: readonly Example<K>[],
  options: FitOptions<K>,
): Record<K, number> {
  const size = options.keys.length;
  const gram = zeros(size, size);
  const moment = new Array<number>(size).fill(0);
  for (const example of examples) {
    const row = vector(example.features, options.keys);
    for (let i = 0; i < size; i += 1) {
      moment[i] = (moment[i] ?? 0) + (row[i] ?? 0) * example.target;
      for (let j = 0; j < size; j += 1) {
        addTo(gram, i, j, (row[i] ?? 0) * (row[j] ?? 0));
      }
    }
  }
  addPenalty(gram, options);
  return toRecord(options.keys, solve(gram, moment));
}

// below this a pivot is treated as zero
const SINGULAR_PIVOT = 1e-12;
const NEWTON_STEPS = 50;
const NEWTON_TOLERANCE = 1e-9;

/**
 * logistic regression by newton's method (irls). the target is 0 or 1; the
 * weights give log-odds. the penalty keeps it finite if a feature separates
 * the classes perfectly
 */
export function fitLogistic<K extends string>(
  examples: readonly Example<K>[],
  options: FitOptions<K>,
): Record<K, number> {
  const size = options.keys.length;
  const rows = examples.map((example) => vector(example.features, options.keys));
  let weights = new Array<number>(size).fill(0);
  for (let step = 0; step < NEWTON_STEPS; step += 1) {
    const hessian = zeros(size, size);
    const gradient = new Array<number>(size).fill(0);
    rows.forEach((row, index) => {
      const target = examples[index]?.target ?? 0;
      const probability = 1 / (1 + Math.exp(-dotVector(weights, row)));
      const curvature = probability * (1 - probability);
      for (let i = 0; i < size; i += 1) {
        gradient[i] = (gradient[i] ?? 0) + (target - probability) * (row[i] ?? 0);
        for (let j = 0; j < size; j += 1) {
          addTo(hessian, i, j, curvature * (row[i] ?? 0) * (row[j] ?? 0));
        }
      }
    });
    options.keys.forEach((key, i) => {
      if (!options.unpenalised.includes(key)) {
        gradient[i] = (gradient[i] ?? 0) - options.penalty * (weights[i] ?? 0);
      }
    });
    addPenalty(hessian, options);
    const delta = solve(hessian, gradient);
    weights = weights.map((weight, i) => weight + (delta[i] ?? 0));
    if (Math.max(...delta.map(Math.abs)) < NEWTON_TOLERANCE) break;
  }
  return toRecord(options.keys, weights);
}

/** gaussian elimination with partial pivoting; throws on a singular system */
export function solve(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] {
  const size = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i] ?? 0]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(a[row]?.[column] ?? 0) > Math.abs(a[pivot]?.[column] ?? 0))
        pivot = row;
    }
    const pivotRow = a[pivot];
    const current = a[column];
    if (pivotRow === undefined || current === undefined) throw new Error('bad matrix');
    if (Math.abs(pivotRow[column] ?? 0) < SINGULAR_PIVOT) {
      throw new Error(
        'the system is singular: two features carry the same information',
      );
    }
    a[pivot] = current;
    a[column] = pivotRow;
    for (let row = column + 1; row < size; row += 1) {
      const target = a[row];
      if (target === undefined) continue;
      const factor = (target[column] ?? 0) / (pivotRow[column] ?? 1);
      for (let k = column; k <= size; k += 1) {
        target[k] = (target[k] ?? 0) - factor * (pivotRow[k] ?? 0);
      }
    }
  }
  const result = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    const values = a[row] ?? [];
    let total = values[size] ?? 0;
    for (let k = row + 1; k < size; k += 1)
      total -= (values[k] ?? 0) * (result[k] ?? 0);
    result[row] = total / (values[row] ?? 1);
  }
  return result;
}

function addPenalty<K extends string>(
  matrix: number[][],
  options: FitOptions<K>,
): void {
  options.keys.forEach((key, i) => {
    if (!options.unpenalised.includes(key)) addTo(matrix, i, i, options.penalty);
  });
}

function vector<K extends string>(
  features: Readonly<Record<K, number>>,
  keys: readonly K[],
) {
  return keys.map((key) => features[key]);
}

function toRecord<K extends string>(keys: readonly K[], values: readonly number[]) {
  return Object.fromEntries(keys.map((key, i) => [key, values[i] ?? 0])) as Record<
    K,
    number
  >;
}

function zeros(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
}

function addTo(matrix: number[][], i: number, j: number, value: number): void {
  const row = matrix[i];
  if (row !== undefined) row[j] = (row[j] ?? 0) + value;
}

function dotVector(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0);
}
