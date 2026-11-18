import { useState } from 'react';
import { cx } from './class-names.js';
import { resolveImageUrl } from './image-registry.js';
import { Tape } from './Tape.js';

export type ImageAspect = 'square' | 'landscape' | 'portrait';

interface ImageSlotProps {
  /** file name inside web/assets/images, e.g. "pitch.jpg" */
  src: string;
  /** empty string for a purely decorative image */
  alt: string;
  variant?: 'plain' | 'polaroid';
  aspect?: ImageAspect;
  /** handwritten line under a polaroid */
  caption?: string;
  className?: string;
}

export function ImageSlot({
  src,
  alt,
  variant = 'plain',
  aspect = 'landscape',
  caption,
  className,
}: ImageSlotProps) {
  const url = resolveImageUrl(src);
  // keyed by url so swapping src clears an earlier load failure
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const missing = url === null || failedUrl === url;

  const frame = missing ? (
    <ImagePlaceholder label={alt || src} decorative={alt === ''} aspect={aspect} />
  ) : (
    <img
      className={cx('ui-image', `ui-aspect-${aspect}`)}
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedUrl(url)}
    />
  );

  if (variant === 'plain') {
    return <div className={cx('ui-image-slot', className)}>{frame}</div>;
  }

  return (
    <figure className={cx('ui-polaroid', className)}>
      <Tape position="top" />
      {frame}
      {caption && <figcaption className="ui-polaroid__caption">{caption}</figcaption>}
    </figure>
  );
}

interface ImagePlaceholderProps {
  label: string;
  decorative: boolean;
  aspect: ImageAspect;
}

function ImagePlaceholder({ label, decorative, aspect }: ImagePlaceholderProps) {
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img', 'aria-label': label };
  return (
    <div className={cx('ui-image-placeholder', `ui-aspect-${aspect}`)} {...a11y}>
      <span className="ui-image-placeholder__label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
