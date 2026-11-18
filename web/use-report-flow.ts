import { useRef, useState } from 'react';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { CoachReport } from '../lib/coach-prompt.js';
import { loadKey } from './key-store.js';
import type { StoredKey } from './key-store.js';
import { parseManagerId, storeManagerId } from './manager-id-store.js';
import { isCacheStale, loadCachedReport, storeCachedReport } from './report-cache.js';
import type { CachedReport } from './report-cache.js';
import { writeReport } from './report-writer.js';
import type { ReportSource } from './report-writer.js';
import { NO_STATUS } from './status-line.js';
import type { StatusLine } from './status-line.js';
import { fetchSummary, SummaryFetchError } from './summary-api.js';

export interface ShownReport {
  managerId: number;
  summary: AnalysisSummary;
  report: CoachReport;
  source: ReportSource;
  errorMessage: string | null;
  // bumped per report so the chat panel remounts with a fresh conversation
  version: number;
}

export interface ReportFlow {
  status: StatusLine;
  busy: boolean;
  /** true while the squad and analysis are being fetched */
  loadingTeam: boolean;
  writing: boolean;
  formHidden: boolean;
  resultsHidden: boolean;
  shown: ShownReport | null;
  fetchReport: (
    managerId: number,
    options?: { forceRefresh?: boolean },
  ) => Promise<void>;
  submitManagerId: (raw: string) => void;
  refresh: () => void;
  showForm: () => void;
  handleKeyChange: (stored: StoredKey | null) => void;
}

export function useReportFlow(): ReportFlow {
  const [status, setStatusLine] = useState<StatusLine>(NO_STATUS);
  const [busy, setBusy] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [writing, setWriting] = useState(false);
  const [formHidden, setFormHidden] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(true);
  const [shown, setShown] = useState<ShownReport | null>(null);
  // bumped per write so a slow, superseded reply can't overwrite a newer report
  const writeGeneration = useRef(0);

  function setStatus(message: string, isError = false): void {
    setStatusLine({ message, isError });
  }

  function applyReport(
    managerId: number,
    cached: CachedReport,
    errorMessage: string | null,
  ): void {
    setStatus('');
    setResultsHidden(false);
    setFormHidden(true);
    setShown((previous) => ({
      managerId,
      summary: cached.analysisSummary,
      report: cached.report,
      source: cached.source,
      errorMessage,
      version: (previous?.version ?? 0) + 1,
    }));
  }

  async function writeAndShowReport(
    managerId: number,
    summary: AnalysisSummary,
  ): Promise<void> {
    const generation = ++writeGeneration.current;
    const apiKey = loadKey()?.key ?? null;
    // the status line lives in the id form, which is hidden once a report is showing
    if (apiKey) {
      setStatus('Sensei is writing your report...');
      setWriting(true);
    }

    const written = await writeReport(summary, apiKey);
    if (generation !== writeGeneration.current) return;
    setWriting(false);

    const cached: CachedReport = {
      report: written.report,
      analysisSummary: summary,
      source: written.source,
      cachedAt: Date.now(),
    };
    storeCachedReport(managerId, cached);
    applyReport(managerId, cached, written.errorMessage);
  }

  async function upgradeToAiReport(
    managerId: number,
    summary: AnalysisSummary,
  ): Promise<void> {
    setBusy(true);
    try {
      await writeAndShowReport(managerId, summary);
    } finally {
      setBusy(false);
    }
  }

  async function fetchReport(
    managerId: number,
    options: { forceRefresh?: boolean } = {},
  ): Promise<void> {
    if (!options.forceRefresh) {
      const cached = loadCachedReport(managerId);
      if (cached && !isCacheStale(cached)) {
        applyReport(managerId, cached, null);
        // a basic report cached before a key was added gets upgraded in place
        if (cached.source === 'basic' && loadKey()) {
          await upgradeToAiReport(managerId, cached.analysisSummary);
        }
        return;
      }
    }

    setBusy(true);
    // the pencil loader carries the message while the squad loads
    setStatus('');
    setLoadingTeam(true);
    setResultsHidden(true);
    // keep progress and errors visible on refresh too
    setFormHidden(false);
    try {
      const summary = await fetchSummary(managerId);
      setLoadingTeam(false);
      storeManagerId(managerId);
      await writeAndShowReport(managerId, summary);
    } catch (err) {
      if (!(err instanceof SummaryFetchError)) throw err;
      setStatus(err.message, true);
    } finally {
      setLoadingTeam(false);
      setBusy(false);
    }
  }

  function submitManagerId(raw: string): void {
    const managerId = parseManagerId(raw);
    if (managerId === null) {
      setStatus('Enter a valid manager ID.', true);
      return;
    }
    void fetchReport(managerId);
  }

  function refresh(): void {
    if (shown) void fetchReport(shown.managerId, { forceRefresh: true });
  }

  function showForm(): void {
    setFormHidden(false);
  }

  // no refetch from fpl: the summary is already here, only the prose changes
  function handleKeyChange(stored: StoredKey | null): void {
    if (stored && shown?.source === 'basic') {
      void upgradeToAiReport(shown.managerId, shown.summary);
    }
  }

  return {
    status,
    busy,
    loadingTeam,
    writing,
    formHidden,
    resultsHidden,
    shown,
    fetchReport,
    submitManagerId,
    refresh,
    showForm,
    handleKeyChange,
  };
}
