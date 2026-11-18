import type { AnalysisSummary } from '../lib/analysis-summary.js';
import { buildChatRequest } from '../lib/chat-prompt.js';
import type { ChatMessage } from '../lib/chat-prompt.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../lib/model.js';
import { AnthropicCallError, sendMessage } from './anthropic-client.js';
import { loadKey } from './key-store.js';
import { onKeyChange } from './key-settings.js';
import { renderMarkdownLite } from './markdown.js';

const GENERIC_CHAT_ERROR = 'Something went wrong. Please try again.';

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

function setChatAvailable(available: boolean): void {
  chatForm.hidden = !available;
  chatDisabledEl.hidden = available;
}

export function initChat(summary: AnalysisSummary): void {
  currentSummary = summary;
  history = [];
  chatMessagesEl.innerHTML = '';
  chatPanel.hidden = false;
  setChatAvailable(loadKey() !== null);
}

onKeyChange((stored) => setChatAvailable(stored !== null));

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const apiKey = loadKey()?.key;
  if (!currentSummary || !apiKey) return;

  const question = chatInput.value.trim();
  if (!question) return;

  appendMessage('user', question);
  chatInput.value = '';

  chatInput.disabled = true;
  chatSendButton.disabled = true;
  const typingEl = appendTypingIndicator();

  try {
    const request = buildChatRequest({
      analysisSummary: currentSummary,
      history,
      question,
      model: DEFAULT_ANTHROPIC_MODEL,
    });
    const reply = await sendMessage(apiKey, request);
    appendMessage('assistant', reply);
    // only completed exchanges go into history, so a failed turn can be retried cleanly
    history.push(
      { role: 'user', content: question },
      { role: 'assistant', content: reply },
    );
  } catch (err) {
    appendMessage(
      'assistant',
      err instanceof AnthropicCallError ? err.message : GENERIC_CHAT_ERROR,
    );
  } finally {
    typingEl.remove();
    chatInput.disabled = false;
    chatSendButton.disabled = false;
    chatInput.focus();
  }
});
