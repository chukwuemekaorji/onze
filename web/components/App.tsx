import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { loadKey } from '../key-store.js';
import type { StoredKey } from '../key-store.js';
import { loadStoredManagerId } from '../manager-id-store.js';
import { wantsExample } from '../router.js';
import { loadSampleSummary } from '../sample-summary.js';
import { useReportFlow } from '../use-report-flow.js';
import { Binder } from './binder/Binder.js';
import { ChatPanel } from './ChatPanel.js';
import { KeySettings } from './KeySettings.js';
import { ManagerIdForm } from './ManagerIdForm.js';
import { TopBar } from './TopBar.js';
import { Drawer } from './ui/Drawer.js';
import { InkFilters } from './ui/InkFilters.js';

const KEY_DRAWER_ID = 'key-drawer';

export function App() {
  const [storedKey, setStoredKey] = useState<StoredKey | null>(() => loadKey());
  const [initialManagerId] = useState(() => loadStoredManagerId());
  const [managerIdText, setManagerIdText] = useState(
    () => initialManagerId?.toString() ?? '',
  );
  const flow = useReportFlow();
  const managerIdInputRef = useRef<HTMLInputElement>(null);
  const aiPillRef = useRef<HTMLButtonElement>(null);
  const [keyDrawerOpen, setKeyDrawerOpen] = useState(false);
  const initialLoadStarted = useRef(false);

  const loadInitialReport = useEffectEvent(() => {
    // the example never touches the user's saved team
    if (wantsExample(window.location.search)) {
      void loadSampleSummary().then(flow.showExample);
      return;
    }
    if (initialManagerId !== null) void flow.fetchReport(initialManagerId);
  });

  useEffect(() => {
    // strict mode runs effects twice in dev, and a second run would pay for a second ai report
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    loadInitialReport();
  }, []);

  function handleKeyChange(stored: StoredKey | null): void {
    setStoredKey(stored);
    flow.handleKeyChange(stored);
  }

  function showManagerIdForm(): void {
    // the input can only take focus once the form is rendered visible
    flushSync(() => flow.showForm());
    managerIdInputRef.current?.focus();
    managerIdInputRef.current?.select();
  }

  return (
    <div className="app">
      <InkFilters />
      <TopBar
        summary={flow.shown?.summary ?? null}
        busy={flow.busy}
        aiOn={storedKey !== null}
        keyDrawerId={KEY_DRAWER_ID}
        keyDrawerOpen={keyDrawerOpen}
        aiPillRef={aiPillRef}
        onRefresh={flow.refresh}
        onChangeTeam={showManagerIdForm}
        onOpenKeyDrawer={() => setKeyDrawerOpen(true)}
      />

      <ManagerIdForm
        inputRef={managerIdInputRef}
        hidden={flow.formHidden}
        value={managerIdText}
        busy={flow.busy}
        loading={flow.loadingTeam}
        status={flow.status}
        onValueChange={setManagerIdText}
        onSubmit={() => flow.submitManagerId(managerIdText)}
      />

      <Drawer
        id={KEY_DRAWER_ID}
        open={keyDrawerOpen}
        title="AI coaching"
        onClose={() => setKeyDrawerOpen(false)}
        returnFocusTo={aiPillRef}
      >
        <KeySettings storedKey={storedKey} onChange={handleKeyChange} />
      </Drawer>

      <main id="results" className="layout" hidden={flow.resultsHidden}>
        {flow.shown && (
          <>
            <Binder shown={flow.shown} writing={flow.writing} />
            <ChatPanel
              key={flow.shown.version}
              summary={flow.shown.summary}
              apiKey={storedKey?.key ?? null}
            />
          </>
        )}
      </main>
    </div>
  );
}
