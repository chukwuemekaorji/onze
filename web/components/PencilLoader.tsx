// sketched with pathLength 1, so the css keyframes work in fractions of each line
export function PencilLoader() {
  return (
    <div className="pencil-loader" role="status">
      <svg
        className="pencil-loader__sketch"
        viewBox="0 0 120 80"
        aria-hidden="true"
        focusable="false"
      >
        <g className="pencil-loader__pitch">
          <rect
            className="pencil-loader__stroke pencil-loader__stroke--outline"
            x="6"
            y="6"
            width="108"
            height="68"
            pathLength={1}
          />
          <line
            className="pencil-loader__stroke pencil-loader__stroke--halfway"
            x1="60"
            y1="6"
            x2="60"
            y2="74"
            pathLength={1}
          />
          <circle
            className="pencil-loader__stroke pencil-loader__stroke--circle"
            cx="60"
            cy="40"
            r="12"
            pathLength={1}
          />
        </g>
        {/* the pencil, drawn pointing down-left with its tip at the origin */}
        <g className="pencil-loader__pencil">
          <g transform="rotate(-40)">
            <path
              className="pencil-loader__pencil-body"
              d="M 1.5 -3 L 22 -3 L 22 3 L 1.5 3 Z"
            />
            <path className="pencil-loader__pencil-tip" d="M 0 0 L 4 -3 L 4 3 Z" />
            <path
              className="pencil-loader__pencil-end"
              d="M 22 -3 L 26 -3 L 26 3 L 22 3 Z"
            />
          </g>
        </g>
      </svg>
      <span className="pencil-loader__label">Loading your team</span>
    </div>
  );
}
