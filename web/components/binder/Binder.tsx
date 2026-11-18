import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import type { ComponentType } from 'react';
import { usePrefersReducedMotion } from '../../motion.js';
import { hasNavigated, HOME_ROUTE, useRoute } from '../../router.js';
import type { RouteId } from '../../router.js';
import type { ShownReport } from '../../use-report-flow.js';
import { BinderTabs } from './BinderTabs.js';
import { CaptaincyPage } from './CaptaincyPage.js';
import { ChipsPage } from './ChipsPage.js';
import type { BinderPageProps } from './page-props.js';
import { PricesPage } from './PricesPage.js';
import { ThisWeekPage } from './ThisWeekPage.js';
import { TransfersPage } from './TransfersPage.js';

const PAGES: Record<RouteId, ComponentType<BinderPageProps>> = {
  week: ThisWeekPage,
  transfers: TransfersPage,
  captaincy: CaptaincyPage,
  chips: ChipsPage,
  prices: PricesPage,
};

// a binder page turning: a short slide out to the left, the next in from the right
const PAGE_FLIP_S = 0.22;
const PAGE_SLIDE_PX = 16;
const APP_TITLE = 'Sensei, Your FPL Coach';

interface BinderProps {
  shown: ShownReport;
  writing: boolean;
}

/** the report as a coach's binder, one tabbed page per route */
export function Binder({ shown, writing }: BinderProps) {
  const route = useRoute();
  const reduced = usePrefersReducedMotion();
  const Page = PAGES[route.id];

  useEffect(() => {
    document.title = route.id === 'week' ? APP_TITLE : `${route.label} · ${APP_TITLE}`;
  }, [route]);

  const flip = reduced
    ? { initial: false as const, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, x: PAGE_SLIDE_PX },
        exit: { opacity: 0, x: -PAGE_SLIDE_PX },
        transition: { duration: PAGE_FLIP_S, ease: 'easeOut' as const },
      };

  return (
    <div className="binder">
      <BinderTabs active={route.id} />

      <div className="binder__sheets">
        <div className="binder__alerts">
          {shown.isExample && (
            <p className="report-label">
              You're looking at an example team, built from real FPL data.{' '}
              {/* a full load, so the example state is left behind */}
              <a href={HOME_ROUTE.path} className="report-label__link">
                Use your own team
              </a>
            </p>
          )}
          <p
            id="report-progress"
            className="report-label"
            role="status"
            hidden={!writing}
          >
            Sensei is writing your AI report...
          </p>
          <div
            id="report-banner"
            className="report-banner"
            role="alert"
            hidden={shown.errorMessage === null}
          >
            {shown.errorMessage}
          </div>
          <p
            id="report-label"
            className="report-label"
            hidden={shown.source !== 'basic'}
          >
            Basic report (no AI). Add an Anthropic API key with the AI coaching button
            at the top for the full write-up and chat.
          </p>
        </div>

        {/* initial false: the page present on load arrives with its own entrance */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={route.id}
            className="binder__sheet"
            animate={{ opacity: 1, x: 0 }}
            {...flip}
          >
            <Page shown={shown} focusTitle={hasNavigated()} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
