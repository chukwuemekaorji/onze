import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { CoachReport } from '../lib/coach-prompt.js';
import { initChat } from './chat.js';
import { loadKey } from './key-store.js';
import { initKeySettings, onKeyChange } from './key-settings.js';
import { renderMarkdownLite } from './markdown.js';
import { writeReport } from './report-writer.js';
import type { ReportSource } from './report-writer.js';

interface SummaryResponseBody {
  analysisSummary: AnalysisSummary;
}

interface ErrorResponseBody {
  error: string;
}

// remembered so returning visitors skip retyping their id
const MANAGER_ID_STORAGE_KEY = 'sensei:managerId';

function loadStoredManagerId(): string | null {
  try {
    return localStorage.getItem(MANAGER_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeManagerId(managerId: number): void {
  try {
    localStorage.setItem(MANAGER_ID_STORAGE_KEY, String(managerId));
  } catch {
    // private browsing or storage disabled; nothing to fall back to
  }
}

// skips the fpl fetch and llm call on reload. dropped once the deadline passes,
// since the advice is stale by then
// v2 adds `source`; older entries are ignored rather than migrated
const REPORT_CACHE_PREFIX = 'sensei:report:v2:';

interface CachedReport {
  report: CoachReport;
  analysisSummary: AnalysisSummary;
  source: ReportSource;
  cachedAt: number;
}

function loadCachedReport(managerId: number): CachedReport | null {
  try {
    const raw = localStorage.getItem(REPORT_CACHE_PREFIX + managerId);
    return raw ? (JSON.parse(raw) as CachedReport) : null;
  } catch {
    return null;
  }
}

function storeCachedReport(
  managerId: number,
  data: Omit<CachedReport, 'cachedAt'>,
): void {
  try {
    const entry: CachedReport = { ...data, cachedAt: Date.now() };
    localStorage.setItem(REPORT_CACHE_PREFIX + managerId, JSON.stringify(entry));
  } catch {
    // storage unavailable, skip caching
  }
}

function isCacheStale(cached: CachedReport): boolean {
  const deadline = new Date(cached.analysisSummary.currentEventDeadline).getTime();
  return Number.isFinite(deadline) && Date.now() > deadline;
}

function formatDeadline(iso: string): string {
  if (!iso) return 'unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const form = document.querySelector<HTMLFormElement>('#coach-form')!;
const managerIdInput = document.querySelector<HTMLInputElement>('#manager-id')!;
const submitButton = document.querySelector<HTMLButtonElement>('#submit-button')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const resultsEl = document.querySelector<HTMLElement>('#results')!;
const squadListEl = document.querySelector<HTMLElement>('#squad-list')!;
const reportEl = document.querySelector<HTMLElement>('#report')!;
const lineupImageEl = document.querySelector<HTMLImageElement>('#lineup-image')!;
const gwInfoEl = document.querySelector<HTMLElement>('#gw-info')!;
const changeIdButton = document.querySelector<HTMLButtonElement>('#change-id-button')!;
const refreshButton = document.querySelector<HTMLButtonElement>('#refresh-button')!;
const reportBannerEl = document.querySelector<HTMLElement>('#report-banner')!;
const reportLabelEl = document.querySelector<HTMLElement>('#report-label')!;
const reportProgressEl = document.querySelector<HTMLElement>('#report-progress')!;

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('status--error', isError);
}

function renderSquad(summary: AnalysisSummary): void {
  squadListEl.innerHTML = '';
  for (const player of summary.squad.squad) {
    const pick = summary.squad.picks.find((p) => p.elementId === player.id);
    const tag = pick?.isCaptain ? '(C)' : pick?.isViceCaptain ? '(VC)' : '';

    const li = document.createElement('li');
    li.className = 'squad-item';

    const nameEl = document.createElement('span');
    nameEl.className = 'squad-item-name';
    nameEl.textContent = player.webName;
    if (tag) {
      const tagEl = document.createElement('em');
      tagEl.textContent = ` ${tag}`;
      nameEl.appendChild(tagEl);
    }

    const metaEl = document.createElement('span');
    metaEl.className = 'squad-item-meta';
    metaEl.textContent = `${player.position} · ${player.teamShortName}`;

    li.append(nameEl, metaEl);
    squadListEl.appendChild(li);
  }
}

function renderReportBanner(errorMessage: string | null): void {
  reportBannerEl.textContent = errorMessage ?? '';
  reportBannerEl.hidden = errorMessage === null;
}

function renderReport(report: CoachReport, source: ReportSource): void {
  reportLabelEl.hidden = source !== 'basic';
  reportEl.innerHTML = '';
  const sections: Array<[string, string]> = [
    ['Summary', report.summary],
    ['Transfer', report.transfers],
    ['Captaincy', report.captaincy],
    ['Formation', report.formation],
    ['Chips', report.chips],
    ['Price Alerts', report.priceAlerts],
  ];
  for (const [title, text] of sections) {
    const section = document.createElement('section');
    section.className = 'report-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const body = document.createElement('p');
    body.innerHTML = renderMarkdownLite(text);
    section.append(heading, body);
    reportEl.appendChild(section);
  }
}

function formatUpdatedAt(cachedAt: number): string {
  const minutesAgo = Math.round((Date.now() - cachedAt) / 60_000);
  if (minutesAgo < 1) return 'just now';
  if (minutesAgo === 1) return '1 minute ago';
  if (minutesAgo < 60) return `${minutesAgo} minutes ago`;
  const hoursAgo = Math.round(minutesAgo / 60);
  return hoursAgo === 1 ? '1 hour ago' : `${hoursAgo} hours ago`;
}

function renderGwInfo(summary: AnalysisSummary, cachedAt: number): void {
  const parts = [
    `GW${summary.currentEvent} deadline: ${formatDeadline(summary.currentEventDeadline)}`,
    `Updated ${formatUpdatedAt(cachedAt)}`,
  ];
  if (summary.nextEvent) {
    parts.push(
      `Next: GW${summary.nextEvent.id}, ${formatDeadline(summary.nextEvent.deadline)}`,
    );
  }
  gwInfoEl.textContent = parts.join(' · ');
  gwInfoEl.hidden = false;
}

let currentManagerId: number | null = null;
let currentSummary: AnalysisSummary | null = null;
let currentSource: ReportSource | null = null;
// bumped per write so a slow, superseded reply can't overwrite a newer report
let writeGeneration = 0;

function applyReport(managerId: number, cached: CachedReport): void {
  currentManagerId = managerId;
  currentSummary = cached.analysisSummary;
  currentSource = cached.source;
  setStatus('');
  resultsEl.hidden = false;
  form.hidden = true;
  changeIdButton.hidden = false;
  refreshButton.hidden = false;
  renderGwInfo(cached.analysisSummary, cached.cachedAt);
  renderSquad(cached.analysisSummary);
  renderReport(cached.report, cached.source);
  lineupImageEl.src = `/api/lineup-image?managerId=${managerId}&event=${cached.analysisSummary.currentEvent}`;
  initChat(cached.analysisSummary);
}

function setBusy(busy: boolean): void {
  submitButton.disabled = busy;
  refreshButton.disabled = busy;
}

async function writeAndShowReport(
  managerId: number,
  summary: AnalysisSummary,
): Promise<void> {
  const generation = ++writeGeneration;
  const apiKey = loadKey()?.key ?? null;
  // the status line lives in the id form, which is hidden once a report is showing
  if (apiKey) {
    setStatus('Sensei is writing your report...');
    reportProgressEl.hidden = false;
  }

  const written = await writeReport(summary, apiKey);
  if (generation !== writeGeneration) return;
  reportProgressEl.hidden = true;

  const cached: CachedReport = {
    report: written.report,
    analysisSummary: summary,
    source: written.source,
    cachedAt: Date.now(),
  };
  storeCachedReport(managerId, cached);
  applyReport(managerId, cached);
  renderReportBanner(written.errorMessage);
}

async function fetchSummary(managerId: number): Promise<AnalysisSummary | null> {
  try {
    const response = await fetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerId }),
    });
    if (!response.ok) {
      const body = (await response.json()) as ErrorResponseBody;
      setStatus(body.error, true);
      return null;
    }
    return ((await response.json()) as SummaryResponseBody).analysisSummary;
  } catch {
    setStatus('Could not reach the server. Please try again.', true);
    return null;
  }
}

async function fetchReport(
  managerId: number,
  options: { forceRefresh?: boolean } = {},
): Promise<void> {
  if (!options.forceRefresh) {
    const cached = loadCachedReport(managerId);
    if (cached && !isCacheStale(cached)) {
      applyReport(managerId, cached);
      renderReportBanner(null);
      // a basic report cached before a key was added gets upgraded in place
      if (cached.source === 'basic' && loadKey()) {
        await upgradeToAiReport(managerId, cached.analysisSummary);
      }
      return;
    }
  }

  setBusy(true);
  setStatus('Fetching your squad...');
  resultsEl.hidden = true;
  // keep progress and errors visible on refresh too
  form.hidden = false;
  try {
    const summary = await fetchSummary(managerId);
    if (!summary) return;
    storeManagerId(managerId);
    await writeAndShowReport(managerId, summary);
  } finally {
    setBusy(false);
  }
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

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const managerId = Number(managerIdInput.value);
  if (!Number.isInteger(managerId) || managerId <= 0) {
    setStatus('Enter a valid manager ID.', true);
    return;
  }
  void fetchReport(managerId);
});

changeIdButton.addEventListener('click', () => {
  form.hidden = false;
  managerIdInput.focus();
  managerIdInput.select();
});

refreshButton.addEventListener('click', () => {
  if (currentManagerId !== null) {
    void fetchReport(currentManagerId, { forceRefresh: true });
  }
});

initKeySettings();

// no refetch from fpl: the summary is already here, only the prose changes
onKeyChange((stored) => {
  if (
    stored &&
    currentSource === 'basic' &&
    currentManagerId !== null &&
    currentSummary
  ) {
    void upgradeToAiReport(currentManagerId, currentSummary);
  }
});

const storedManagerId = loadStoredManagerId();
const parsedStoredId = Number(storedManagerId);
if (
  storedManagerId !== null &&
  Number.isInteger(parsedStoredId) &&
  parsedStoredId > 0
) {
  managerIdInput.value = storedManagerId;
  void fetchReport(parsedStoredId);
}
