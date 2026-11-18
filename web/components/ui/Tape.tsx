import { cx } from './class-names.js';

export type TapePosition = 'top-left' | 'top-right' | 'top';

interface TapeProps {
  position: TapePosition;
}

/** a strip of masking tape. purely decorative */
export function Tape({ position }: TapeProps) {
  return <span className={cx('ui-tape', `ui-tape--${position}`)} aria-hidden="true" />;
}
