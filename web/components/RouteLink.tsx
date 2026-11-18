import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from '../router.js';

interface RouteLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
}

/**
 * a real link that switches binder pages without a reload. modified clicks
 * (new tab, new window) and middle clicks fall through to the browser
 */
export function RouteLink({ to, onClick, ...rest }: RouteLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  }

  return <a href={to} onClick={handleClick} {...rest} />;
}
