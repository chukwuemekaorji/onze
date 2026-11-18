export const INK_WOBBLE_FILTER_ID = 'ink-wobble';
/** use as an svg filter attribute or a css filter value */
export const INK_WOBBLE_FILTER = `url(#${INK_WOBBLE_FILTER_ID})`;

// rendered once at the app root. sized to zero rather than display:none, which
// stops some browsers resolving the filter
export function InkFilters() {
  return (
    <svg className="ui-svg-defs" aria-hidden="true" focusable="false">
      <defs>
        {/* userSpaceOnUse so the region covers the whole drawing, stroke included,
            not just the path's thin bounding box */}
        <filter
          id={INK_WOBBLE_FILTER_ID}
          filterUnits="userSpaceOnUse"
          x="-10%"
          y="-25%"
          width="120%"
          height="150%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.035"
            numOctaves="2"
            seed="7"
            result="wobble-noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="wobble-noise"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
