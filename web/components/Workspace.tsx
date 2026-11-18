import { useRoute } from '../router.js';
import { LAPTOP_QUERY, useMediaQuery } from '../use-media-query.js';
import type { ShownReport } from '../use-report-flow.js';
import { Binder } from './binder/Binder.js';
import { BinderTabs } from './binder/BinderTabs.js';
import { CoachLauncher } from './coach/CoachLauncher.js';
import { CoachPanel } from './coach/CoachPanel.js';

interface WorkspaceProps {
  shown: ShownReport;
  writing: boolean;
  apiKey: string | null;
}

/**
 * the report screen: tabs under the header, the open tab's page, and the coach.
 * on a laptop the coach is docked beside the page and the whole thing fits one
 * screen; below that it's a drawer behind a floating button
 */
export function Workspace({ shown, writing, apiKey }: WorkspaceProps) {
  const route = useRoute();
  const isLaptop = useMediaQuery(LAPTOP_QUERY);

  return (
    <div className="workspace">
      <BinderTabs active={route.id} />
      <div className="workspace__body">
        <Binder shown={shown} writing={writing} />
        {/* one coach at a time, so the chat's element ids stay unique */}
        {isLaptop ? (
          <CoachPanel shown={shown} apiKey={apiKey} />
        ) : (
          <CoachLauncher shown={shown} apiKey={apiKey} />
        )}
      </div>
    </div>
  );
}
