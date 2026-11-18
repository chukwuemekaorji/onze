import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { CoachReport } from '../lib/coach-prompt.js';
import { initChat } from './chat.js';

interface CoachResponseBody {
  report: CoachReport;
  analysisSummary: AnalysisSummary;
  usedFallback: boolean;
}

interface ErrorResponseBody {
  error: string;
}

const form = document.querySelector<HTMLFormElement>('#coach-form')!;
const managerIdInput = document.querySelector<HTMLInputElement>('#manager-id')!;
const submitButton = document.querySelector<HTMLButtonElement>('#submit-button')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const resultsEl = document.querySelector<HTMLElement>('#results')!;
const squadListEl = document.querySelector<HTMLElement>('#squad-list')!;
const reportEl = document.querySelector<HTMLElement>('#report')!;

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('status--error', isError);
}

function renderSquad(summary: AnalysisSummary): void {
  squadListEl.innerHTML = '';
  for (const player of summary.squad.squad) {
    const pick = summary.squad.picks.find((p) => p.elementId === player.id);
    const tag = pick?.isCaptain ? ' (C)' : pick?.isViceCaptain ? ' (VC)' : '';
    const li = document.createElement('li');
    li.className = 'squad-item';
    li.textContent = `${player.webName}${tag} — ${player.position} — ${player.teamShortName}`;
    squadListEl.appendChild(li);
  }
}

function renderReport(report: CoachReport): void {
  reportEl.innerHTML = '';
  const sections: Array<[string, string]> = [
    ['Summary', report.summary],
    ['Transfers', report.transfers],
    ['Captaincy', report.captaincy],
    ['Chips', report.chips],
    ['Price Alerts', report.priceAlerts],
  ];
  for (const [title, text] of sections) {
    const section = document.createElement('section');
    section.className = 'report-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const body = document.createElement('p');
    body.textContent = text;
    section.append(heading, body);
    reportEl.appendChild(section);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const managerId = Number(managerIdInput.value);
  if (!Number.isInteger(managerId) || managerId <= 0) {
    setStatus('Enter a valid manager ID.', true);
    return;
  }

  submitButton.disabled = true;
  setStatus('Fetching your squad and building your report…');
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
    setStatus('');
    resultsEl.hidden = false;
    renderSquad(body.analysisSummary);
    renderReport(body.report);
    initChat(body.analysisSummary, body.usedFallback);
  } catch {
    setStatus('Could not reach the server. Please try again.', true);
  } finally {
    submitButton.disabled = false;
  }
});
