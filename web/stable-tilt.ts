/**
 * a small tilt that's always the same for the same key, so a card keeps its
 * angle when its page is left and revisited. fnv-1a hash, folded into range
 */
export function stableTilt(key: string, maxDegrees: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const unit = (hash >>> 0) / 0xffffffff;
  return (unit * 2 - 1) * maxDegrees;
}
