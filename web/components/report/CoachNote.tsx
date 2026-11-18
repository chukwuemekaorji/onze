import { renderMarkdownLite } from '../../markdown.js';

interface CoachNoteProps {
  text: string;
}

/** a section of the ai report, written under the card's own data */
export function CoachNote({ text }: CoachNoteProps) {
  if (!text.trim()) return null;
  return (
    <div className="coach-note">
      <span className="coach-note__lead">Coach:</span>{' '}
      {/* model output only reaches the dom through renderMarkdownLite, which escapes first */}
      <span dangerouslySetInnerHTML={{ __html: renderMarkdownLite(text) }} />
    </div>
  );
}
