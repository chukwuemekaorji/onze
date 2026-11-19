import { BinderPage } from './BinderPage.js';
import type { BinderPageProps } from './page-props.js';
import { PitchStage } from './PitchStage.js';

/** only the lineup: the pitch and bench, sized to fit the screen on a laptop */
export function ThisWeekPage({ shown, focusTitle }: BinderPageProps) {
  return (
    <BinderPage title="This week" focusTitle={focusTitle} className="this-week">
      <div className="this-week__pitch">
        <PitchStage summary={shown.summary} />
      </div>
    </BinderPage>
  );
}
