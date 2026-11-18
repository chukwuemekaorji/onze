import { INK_WOBBLE_FILTER } from './ui/InkFilters.js';

interface BrandMarkProps {
  className: string;
}

/** a chalkboard play: a player, a marker and the run between them */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="8" cy="22" r="4.5" filter={INK_WOBBLE_FILTER} />
      <path d="M20 5 l7 7 M27 5 l-7 7" filter={INK_WOBBLE_FILTER} />
      <path
        className="brand-mark__arrow"
        d="M11.5 18 C 14 12, 17 15, 21 13 M17.5 11.6 L21 13 L19.2 16.4"
        filter={INK_WOBBLE_FILTER}
      />
    </svg>
  );
}
