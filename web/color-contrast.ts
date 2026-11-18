/** wcag 2 contrast maths for #rrggbb colours */

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`expected a #rrggbb colour, got "${hex}"`);
  const [r, g, b] = match
    .slice(1)
    .map((pair) => channelLuminance(parseInt(pair, 16))) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** whichever of the two candidates reads better on the background */
export function mostReadable<T extends string>(
  background: string,
  candidates: readonly [T, T],
): T {
  const [first, second] = candidates;
  return contrastRatio(background, first) >= contrastRatio(background, second)
    ? first
    : second;
}
