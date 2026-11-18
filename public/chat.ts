import type { AnalysisSummary } from '../lib/analysis-summary.js';
import { renderMarkdownLite } from './markdown.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponseBody {
  reply?: string;
  error?: string;
}

let currentSummary: AnalysisSummary | null = null;
let history: ChatMessage[] = [];

const chatPanel = document.querySelector<HTMLElement>('#chat-panel')!;
const chatForm = document.querySelector<HTMLFormElement>('#chat-form')!;
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')!;
const chatSendButton = chatForm.querySelector<HTMLButtonElement>('button')!;
const chatMessagesEl = document.querySelector<HTMLElement>('#chat-messages')!;
const chatDisabledEl = document.querySelector<HTMLElement>('#chat-disabled')!;

function appendMessage(role: ChatMessage['role'], content: string): void {
  const div = document.createElement('div');
  div.className = `chat-message chat-message--${role}`;
  div.innerHTML = renderMarkdownLite(content);
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function appendTypingIndicator(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'chat-message chat-message--assistant chat-message--typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return div;
}

export function initChat(summary: AnalysisSummary, usedFallback: boolean): void {
  currentSummary = summary;
  history = [];
  chatMessagesEl.innerHTML = '';
  chatPanel.hidden = false;
  chatForm.hidden = usedFallback;
  chatDisabledEl.hidden = !usedFallback;
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentSummary) return;

  const message = chatInput.value.trim();
  if (!message) return;

  appendMessage('user', message);
  chatInput.value = '';
  const historyBeforeThisMessage = [...history];
  history.push({ role: 'user', content: message });

  chatInput.disabled = true;
  chatSendButton.disabled = true;
  const typingEl = appendTypingIndicator();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        analysisSummary: currentSummary,
        history: historyBeforeThisMessage,
      }),
    });

    const body = (await response.json()) as ChatResponseBody;
    typingEl.remove();

    if (!response.ok || !body.reply) {
      appendMessage('assistant', body.error ?? 'Something went wrong. Please try again.');
      return;
    }

    appendMessage('assistant', body.reply);
    history.push({ role: 'assistant', content: body.reply });
  } catch {
    typingEl.remove();
    appendMessage('assistant', 'Could not reach the server. Please try again.');
  } finally {
    chatInput.disabled = false;
    chatSendButton.disabled = false;
    chatInput.focus();
  }
});
