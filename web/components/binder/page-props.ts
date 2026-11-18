import type { CoachReport } from '../../../lib/coach-prompt.js';
import type { ShownReport } from '../../use-report-flow.js';

export interface BinderPageProps {
  shown: ShownReport;
  /** true when the page arrived by navigation, so its title takes focus */
  focusTitle: boolean;
}

/** a section of ai prose, or null for a basic report, whose text just restates the page */
export function aiNote(shown: ShownReport, section: keyof CoachReport): string | null {
  return shown.source === 'ai' ? shown.report[section] : null;
}
