import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cx } from './class-names.js';

export type ButtonVariant = 'primary' | 'outline';

interface CommonButtonProps {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonButtonProps &
  Omit<ComponentPropsWithoutRef<'button'>, keyof CommonButtonProps> & {
    href?: undefined;
  };

type ButtonAsLink = CommonButtonProps &
  Omit<ComponentPropsWithoutRef<'a'>, keyof CommonButtonProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/** renders an <a> when given an href, otherwise a <button> */
export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant = 'primary', className, children, ...linkProps } = props;
    return (
      <a className={cx('ui-button', `ui-button--${variant}`, className)} {...linkProps}>
        {children}
      </a>
    );
  }

  const {
    variant = 'primary',
    className,
    children,
    type = 'button',
    href: _href,
    ...buttonProps
  } = props;
  return (
    <button
      type={type}
      className={cx('ui-button', `ui-button--${variant}`, className)}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
