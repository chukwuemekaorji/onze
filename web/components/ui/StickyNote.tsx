import type { ComponentPropsWithoutRef } from 'react';
import { cx } from './class-names.js';

interface StickyNoteProps extends ComponentPropsWithoutRef<'div'> {
  tilt?: 'left' | 'right';
}

/** a yellow sticky with the coach's handwriting */
export function StickyNote({
  tilt = 'left',
  className,
  children,
  ...rest
}: StickyNoteProps) {
  return (
    <div className={cx('ui-sticky', `ui-sticky--${tilt}`, className)} {...rest}>
      {children}
    </div>
  );
}
