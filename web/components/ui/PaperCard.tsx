import type { ComponentPropsWithoutRef } from 'react';
import { cx } from './class-names.js';
import { Tape } from './Tape.js';

export type CardTilt = 'none' | 'left' | 'right';

interface PaperCardProps extends ComponentPropsWithoutRef<'div'> {
  as?: 'div' | 'section' | 'article' | 'aside';
  tilt?: CardTilt;
  /** tape across both top corners */
  tape?: boolean;
}

/** an index card: off-white stock, red header rule, hard sticker shadow */
export function PaperCard({
  as: Tag = 'div',
  tilt = 'none',
  tape = false,
  className,
  children,
  ...rest
}: PaperCardProps) {
  return (
    <Tag
      className={cx('ui-paper-card', tilt !== 'none' && `ui-tilt-${tilt}`, className)}
      {...rest}
    >
      {tape && (
        <>
          <Tape position="top-left" />
          <Tape position="top-right" />
        </>
      )}
      {children}
    </Tag>
  );
}
