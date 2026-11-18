import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { CoachReport } from '../lib/coach-prompt.js';
import { initChat } from './chat.js';
import { renderMarkdownLite } from './markdown.js';

interface CoachResponseBody {
  report: CoachReport;
  analysisSummary: AnalysisSummary;
  usedFallback: boolean;
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
const REPORT_CACHE_PREFIX = 'sensei:report:';

interface CachedReport {
  report: CoachReport;
  analysisSummary: AnalysisSummary;
  usedFallback: boolean;
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

function renderReport(report: CoachReport): void {
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
    parts.push(`Next: GW${summary.nextEvent.id}, ${formatDeadline(summary.nextEvent.deadline)}`);
  }
  gwInfoEl.textContent = parts.join(' · ');
  gwInfoEl.hidden = false;
}

let currentManagerId: number | null = null;

function applyReport(
  managerId: number,
  report: CoachReport,
  analysisSummary: AnalysisSummary,
  usedFallback: boolean,
  cachedAt: number,
): void {
  currentManagerId = managerId;
  setStatus('');
  resultsEl.hidden = false;
  form.hidden = true;
  changeIdButton.hidden = false;
  refreshButton.hidden = false;
  renderGwInfo(analysisSummary, cachedAt);
  renderSquad(analysisSummary);
  renderReport(report);
  lineupImageEl.src = `/api/lineup-image?managerId=${managerId}&event=${analysisSummary.currentEvent}`;
  initChat(analysisSummary, usedFallback);
}

async function fetchReport(
  managerId: number,
  options: { forceRefresh?: boolean } = {},
): Promise<void> {
  if (!options.forceRefresh) {
    const cached = loadCachedReport(managerId);
    if (cached && !isCacheStale(cached)) {
      applyReport(managerId, cached.report, cached.analysisSummary, cached.usedFallback, cached.cachedAt);
      return;
    }
  }

  submitButton.disabled = true;
  refreshButton.disabled = true;
  setStatus('Fetching your squad and building your report...');
  resultsEl.hidden = true;

  try {
    const response = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerId }),
    });

    if (!response.ok) {
      const body = (await response.json()) as ErrorResponseBody;
      setStatus(body.error, true);
      return;
    }

    const body = (await response.json()) as CoachResponseBody;
    storeManagerId(managerId);
    storeCachedReport(managerId, {
      report: body.report,
      analysisSummary: body.analysisSummary,
      usedFallback: body.usedFallback,
    });
    applyReport(managerId, body.report, body.analysisSummary, body.usedFallback, Date.now());
  } catch {
    setStatus('Could not reach the server. Please try again.', true);
  } finally {
    submitButton.disabled = false;
    refreshButton.disabled = false;
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

const storedManagerId = loadStoredManagerId();
const parsedStoredId = Number(storedManagerId);
if (storedManagerId !== null && Number.isInteger(parsedStoredId) && parsedStoredId > 0) {
  managerIdInput.value = storedManagerId;
  void fetchReport(parsedStoredId);
}
