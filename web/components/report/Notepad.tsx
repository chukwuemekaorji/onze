import { motion } from 'motion/react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { renderMarkdownLite } from '../../markdown.js';
import { usePrefersReducedMotion } from '../../motion.js';
import { measureWordLines, wrapWords } from '../../text-lines.js';
import type { LineBox } from '../../text-lines.js';

const COVER_FLIP_S = 0.45;
// the cover is folded back over the top, past vertical, where its back is hidden
const COVER_OPEN_ANGLE_DEG = -180;
// writing starts as the cover clears the page
const WRITE_START_S = 0.32;
const LINE_WRITE_S = 0.4;
// covers reach a hair past each line so no ascender peeks out early
const LINE_COVER_BLEED_PX = 2;
const SPIRAL_RINGS = 14;

interface NotepadProps {
  /** the coach's summary, plain text with lite markdown */
  text: string;
}

/**
 * a closed notepad that flips open to the coach's summary, which then writes
 * itself in line by line. the text stays in the dom throughout, so screen
 * readers get it whether the cover is open or not
 */
export function Notepad({ text }: NotepadProps) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<LineBox[]>([]);
  const writingRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const pageId = useId();

  const html = wrapWords(renderMarkdownLite(text));

  // measured before paint, so the covers are already over the text when it shows
  useLayoutEffect(() => {
    const writingEl = writingRef.current;
    setLines(open && !reduced && writingEl ? measureWordLines(writingEl) : []);
  }, [open, reduced, html]);

  function toggle(): void {
    setOpen((wasOpen) => !wasOpen);
  }

  // a click on the open page closes it, unless the reader was selecting text
  function handlePageClick(): void {
    if (open && window.getSelection()?.isCollapsed !== false) setOpen(false);
  }

  return (
    <div className={`notepad${open ? ' notepad--open' : ''}`}>
      <button
        type="button"
        className="notepad__binding"
        aria-expanded={open}
        aria-controls={pageId}
        onClick={toggle}
      >
        <span className="sr-only">Coach's notes</span>
        <svg
          className="notepad__spiral"
          viewBox={`0 0 ${SPIRAL_RINGS * 20} 26`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {Array.from({ length: SPIRAL_RINGS }, (_, index) => {
            const x = index * 20 + 6;
            return (
              <path key={index} d={`M ${x} 20 C ${x} 2, ${x + 8} 2, ${x + 8} 20`} />
            );
          })}
        </svg>
      </button>

      <div className="notepad__sheets">
        {/* the one piece of tape left in the design, holding the pad down */}
        <span className="ui-tape notepad__tape" aria-hidden="true" />
        {/* the bottom corner curls up on hover, like a page about to be turned */}
        <span className="notepad__corner" aria-hidden="true" />
        <div id={pageId} className="notepad__page" onClick={handlePageClick}>
          {/* words and covers share this positioned box, so word offsets place the covers */}
          <div ref={writingRef} className="notepad__writing">
            {/* model output only reaches the dom through renderMarkdownLite, which escapes first */}
            <p className="notepad__text" dangerouslySetInnerHTML={{ __html: html }} />
            {lines.map((line, index) => (
              <motion.span
                key={`${index}-${line.top}`}
                className="notepad__line-cover"
                aria-hidden="true"
                // measured geometry has to be set inline; it goes through the cssom,
                // which the csp allows, not a style attribute
                style={{
                  left: `${line.left - LINE_COVER_BLEED_PX}px`,
                  top: `${line.top - LINE_COVER_BLEED_PX}px`,
                  width: `${line.width + 2 * LINE_COVER_BLEED_PX}px`,
                  height: `${line.height + 2 * LINE_COVER_BLEED_PX}px`,
                }}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{
                  delay: WRITE_START_S + index * LINE_WRITE_S,
                  duration: LINE_WRITE_S,
                  ease: 'linear',
                }}
              />
            ))}
          </div>
        </div>

        {/* decorative; the binding button is the control. a click here is a shortcut */}
        <motion.div
          className="notepad__cover"
          aria-hidden="true"
          onClick={toggle}
          initial={false}
          animate={{ rotateX: open ? COVER_OPEN_ANGLE_DEG : 0 }}
          transition={{ duration: reduced ? 0 : COVER_FLIP_S, ease: 'easeInOut' }}
        >
          <span className="notepad__cover-title">Coach's notes</span>
          <span className="notepad__cover-hint">Tap to open</span>
        </motion.div>
      </div>
    </div>
  );
}
