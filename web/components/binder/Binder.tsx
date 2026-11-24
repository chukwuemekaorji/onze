import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import type { ComponentType } from 'react';
import { usePrefersReducedMotion } from '../../motion.js';
import { useReportStage } from '../../report-stage.js';
import { hasNavigated, HOME_ROUTE, useRoute } from '../../router.js';
import type { RouteId } from '../../router.js';
import type { ShownReport } from '../../use-report-flow.js';
import { HowOnzePredicts } from '../HowOnzePredicts.js';
import { CaptaincyPage } from './CaptaincyPage.js';
import { ChipsPage } from './ChipsPage.js';
import { LeaguesPage } from './LeaguesPage.js';
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
  leagues: LeaguesPage,
};

// switching tabs is editorial, so the pages simply cross-fade
const PAGE_FLIP_S = 0.2;
const APP_TITLE = 'onze, your FPL coach';

interface BinderProps {
  shown: ShownReport;
  writing: boolean;
}

/** the open tab's page, under the tab bar; each route is one page */
export function Binder({ shown, writing }: BinderProps) {
  const route = useRoute();
  const reduced = usePrefersReducedMotion();
  const Page = PAGES[route.id];
  const { refreshError } = useReportStage();
  // a failed refresh leaves the old report up, so its error leads
  const bannerMessage = refreshError ?? shown.errorMessage;

  useEffect(() => {
    document.title = route.id === 'week' ? APP_TITLE : `${route.label} · ${APP_TITLE}`;
  }, [route]);

  const flip = reduced
    ? { initial: false as const, transition: { duration: 0 } }
    : {
        initial: { opacity: 0 },
        exit: { opacity: 0 },
        transition: { duration: PAGE_FLIP_S, ease: 'easeOut' as const },
      };

  return (
    <div className="binder">
      <div className="binder__sheets">
        <div className="binder__alerts">
          {shown.isExample && (
            <p className="report-label">
              Example team, built from real FPL data.{' '}
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
            onze is writing your AI report...
          </p>
          <div
            id="report-banner"
            className="report-banner"
            role="alert"
            hidden={bannerMessage === null}
          >
            {bannerMessage}
          </div>
          <p
            id="report-label"
            className="report-label"
            hidden={shown.source !== 'basic'}
          >
            Basic report (no AI). Add your Anthropic key at the top for the full
            write-up and chat.
          </p>
        </div>
        {/* no initial={false} here: it would also cancel the entrances inside the
            page, like the pitch drawing itself and the shirts landing */}
        <AnimatePresence mode="wait">
          <motion.div
            key={route.id}
            className="binder__sheet"
            animate={{ opacity: 1 }}
            {...flip}
          >
            <Page shown={shown} focusTitle={hasNavigated()} />
          </motion.div>
        </AnimatePresence>
        <HowOnzePredicts className="binder__how" />
      </div>
    </div>
  );
}
