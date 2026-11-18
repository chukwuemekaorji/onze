import { useRef, useState } from 'react';
import type { ShownReport } from '../../use-report-flow.js';
import { Drawer } from '../ui/Drawer.js';
import { CoachContent } from './CoachContent.js';
import { CoachIcon } from './CoachIcon.js';

const COACH_DRAWER_ID = 'coach-drawer';

interface CoachLauncherProps {
  shown: ShownReport;
  apiKey: string | null;
}

/** below laptop width: a floating coach button that opens the coach as a drawer */
export function CoachLauncher({ shown, apiKey }: CoachLauncherProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="coach-fab"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={COACH_DRAWER_ID}
        onClick={() => setOpen(true)}
      >
        <CoachIcon />
        Coach
      </button>
      <Drawer
        id={COACH_DRAWER_ID}
        open={open}
        title="Coach"
        onClose={() => setOpen(false)}
        returnFocusTo={buttonRef}
      >
        <CoachContent shown={shown} apiKey={apiKey} />
      </Drawer>
    </>
  );
}
