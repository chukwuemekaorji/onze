import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { flushSync } from 'react-dom';
import type { AnalysisSummary } from '../../lib/analysis-summary.js';
import { buildChatRequest } from '../../lib/chat-prompt.js';
import type { ChatMessage } from '../../lib/chat-prompt.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../../lib/model.js';
import { trackChatMessageSent } from '../analytics.js';
import { AnthropicCallError, sendMessage } from '../anthropic-client.js';
import { clearChat, loadChat, pruneStaleChats, saveChat } from '../chat-store.js';
import { renderMarkdownLite } from '../markdown.js';
import { DRAWER_FOCUS_ATTRIBUTE } from './ui/Drawer.js';

const GENERIC_CHAT_ERROR = 'Something went wrong. Please try again.';

interface DisplayedMessage extends ChatMessage {
  id: number;
}

interface ChatPanelProps {
  summary: AnalysisSummary;
  apiKey: string | null;
  /** whose conversation to keep across reloads; null for the example team, which keeps none */
  managerId: number | null;
}

export function ChatPanel({ summary, apiKey, managerId }: ChatPanelProps) {
  // the saved conversation, read once when the panel mounts for this report
  const [restored] = useState<ChatMessage[]>(() =>
    managerId === null ? [] : loadChat(managerId, summary),
  );
  const [messages, setMessages] = useState<DisplayedMessage[]>(() =>
    restored.map((message, id) => ({ ...message, id })),
  );
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  // only completed exchanges go into history, so a failed turn can be retried cleanly
  const history = useRef<ChatMessage[]>(restored);
  const nextMessageId = useRef(restored.length);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const available = apiKey !== null;

  useEffect(() => {
    pruneStaleChats();
  }, []);

  useEffect(() => {
    const messagesEl = messagesRef.current;
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }, [messages, sending]);

  function appendMessage(role: ChatMessage['role'], content: string): void {
    const id = nextMessageId.current++;
    setMessages((previous) => [...previous, { id, role, content }]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const asked = question.trim();
    if (!apiKey || !asked) return;

    appendMessage('user', asked);
    // the event only: the question stays between the browser and anthropic
    trackChatMessageSent();
    setQuestion('');
    setSending(true);

    try {
      const request = buildChatRequest({
        analysisSummary: summary,
        history: history.current,
        question: asked,
        model: DEFAULT_ANTHROPIC_MODEL,
      });
      const reply = await sendMessage(apiKey, request);
      appendMessage('assistant', reply);
      history.current = [
        ...history.current,
        { role: 'user', content: asked },
        { role: 'assistant', content: reply },
      ];
      if (managerId !== null) saveChat(managerId, summary, history.current);
    } catch (err) {
      appendMessage(
        'assistant',
        err instanceof AnthropicCallError ? err.message : GENERIC_CHAT_ERROR,
      );
    } finally {
      // the input can only take focus once it's re-enabled in the dom
      flushSync(() => setSending(false));
      inputRef.current?.focus();
    }
  }

  function handleClear(): void {
    history.current = [];
    setMessages([]);
    if (managerId !== null) clearChat(managerId, summary.currentEvent);
    inputRef.current?.focus();
  }

  return (
    <section id="chat-panel" className="chat-panel" aria-labelledby="chat-heading">
      <div className="chat-panel__header">
        <h3 id="chat-heading" className="chat-panel__title">
          Ask onze
        </h3>
        {messages.length > 0 && (
          <button
            type="button"
            className="text-link chat-panel__clear"
            disabled={sending}
            onClick={handleClear}
          >
            Clear chat
          </button>
        )}
      </div>
      <div id="chat-disabled" className="chat-disabled" hidden={available}>
        Add your Anthropic API key with the AI coaching button at the top to chat with
        onze about this report.
      </div>
      <div id="chat-messages" className="chat-messages" ref={messagesRef}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-message chat-message--${message.role}`}
            // model output only reaches the dom through renderMarkdownLite, which escapes first
            dangerouslySetInnerHTML={{ __html: renderMarkdownLite(message.content) }}
          />
        ))}
        {sending && (
          <div className="chat-message chat-message--assistant chat-message--typing">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
      </div>
      <form
        id="chat-form"
        className="chat-form"
        hidden={!available}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <input
          ref={inputRef}
          id="chat-input"
          {...{ [DRAWER_FOCUS_ATTRIBUTE]: true }}
          type="text"
          placeholder="Ask a follow-up, e.g. why not captain Salah?"
          autoComplete="off"
          value={question}
          disabled={sending}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" aria-label="Send" disabled={sending}>
          Send
        </button>
      </form>
    </section>
  );
}
