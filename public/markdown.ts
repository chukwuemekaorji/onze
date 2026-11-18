/**
 * Minimal, safe markdown-to-HTML for LLM-written prose: bold and line
 * breaks only. Escapes first so nothing the model writes can inject
 * markup. This is not a general markdown renderer.
 */

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderMarkdownLite(text: string): string {
  const escaped = escapeHtml(text);
  const bolded = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return bolded.replace(/\n/g, '<br>');
}
