import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../motion.js';

interface BinderPageProps {
  title: string;
  /** move focus to the title on arrival, so a screen reader hears the new page */
  focusTitle: boolean;
  className?: string;
  children: ReactNode;
}

export function BinderPage({
  title,
  focusTitle,
  className,
  children,
}: BinderPageProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const titleEl = titleRef.current;
    if (!focusTitle || !titleEl) return;
    titleEl.focus({ preventScroll: true });
    // a tab clicked further down the page leaves the binder's top out of view
    const binder = titleEl.closest('.binder');
    if (binder && binder.getBoundingClientRect().top < 0) {
      binder.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [focusTitle, reduced]);

  return (
    <section
      className={`binder-page${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
    >
      <h2 ref={titleRef} id={titleId} className="binder-page__title" tabIndex={-1}>
        {title}
      </h2>
      {children}
    </section>
  );
}
