import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { flushSync } from 'react-dom';
import type { AnalysisSummary } from '../../lib/analysis-summary.js';
import { buildChatRequest } from '../../lib/chat-prompt.js';
import type { ChatMessage } from '../../lib/chat-prompt.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../../lib/model.js';
import { AnthropicCallError, sendMessage } from '../anthropic-client.js';
import { renderMarkdownLite } from '../markdown.js';
import { DRAWER_FOCUS_ATTRIBUTE } from './ui/Drawer.js';

const GENERIC_CHAT_ERROR = 'Something went wrong. Please try again.';

interface DisplayedMessage extends ChatMessage {
  id: number;
}

interface ChatPanelProps {
  summary: AnalysisSummary;
  apiKey: string | null;
}

export function ChatPanel({ summary, apiKey }: ChatPanelProps) {
  const [messages, setMessages] = useState<DisplayedMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  // only completed exchanges go into history, so a failed turn can be retried cleanly
  const history = useRef<ChatMessage[]>([]);
  const nextMessageId = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const available = apiKey !== null;

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

  return (
    <section id="chat-panel" className="chat-panel" aria-labelledby="chat-heading">
      <h3 id="chat-heading" className="chat-panel__title">
        Ask Sensei
      </h3>
      <div id="chat-disabled" className="chat-disabled" hidden={available}>
        Add your Anthropic API key with the AI coaching button at the top to chat with
        Sensei about this report.
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
