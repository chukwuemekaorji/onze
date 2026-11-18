const IMAGES_DIR = '../../assets/images/';

// vite resolves this at build time, so a missing file is simply absent from the map
// and every image gets a hashed url under /assets (img-src 'self')
const BUNDLED_IMAGE_URLS = import.meta.glob<string>(
  '../../assets/images/*.{png,jpg,jpeg,webp,avif,gif,svg}',
  { eager: true, query: '?url', import: 'default' },
);

/** file name inside web/assets/images, e.g. "pitch.jpg", to its served url */
export function resolveImageUrl(
  fileName: string,
  urls: Record<string, string> = BUNDLED_IMAGE_URLS,
): string | null {
  const baseName = fileName.split('/').pop() ?? '';
  if (!baseName) return null;
  return urls[IMAGES_DIR + baseName] ?? null;
}
