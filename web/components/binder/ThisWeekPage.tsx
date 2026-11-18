import { Pitch } from '../Pitch.js';
import { BinderPage } from './BinderPage.js';
import type { BinderPageProps } from './page-props.js';

/** only the lineup: the pitch and bench, sized to fit the screen on a laptop */
export function ThisWeekPage({ shown, focusTitle }: BinderPageProps) {
  return (
    <BinderPage title="This week" focusTitle={focusTitle} className="this-week">
      <div className="this-week__pitch">
        <Pitch summary={shown.summary} />
      </div>
    </BinderPage>
  );
}
