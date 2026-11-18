import { describe, expect, it } from 'vitest';
import { resolveImageUrl } from '../web/components/ui/image-registry.js';

const URLS = {
  '../../assets/images/pitch.jpg': '/assets/pitch-abc123.jpg',
};

describe('resolveImageUrl', () => {
  it('maps a file name to its bundled url', () => {
    expect(resolveImageUrl('pitch.jpg', URLS)).toBe('/assets/pitch-abc123.jpg');
  });

  it('accepts a path and uses only the file name', () => {
    expect(resolveImageUrl('web/assets/images/pitch.jpg', URLS)).toBe(
      '/assets/pitch-abc123.jpg',
    );
  });

  it('returns null for a missing image so the placeholder shows', () => {
    expect(resolveImageUrl('coach.png', URLS)).toBeNull();
    expect(resolveImageUrl('', URLS)).toBeNull();
    expect(resolveImageUrl('images/', URLS)).toBeNull();
  });
});
