import { Link } from 'react-router-dom';
import { verseLink } from '../../../services/personalLibrary.js';
export default function SavedPassage({ item }) {
  return <div className="space-y-3">
    <Link to={verseLink(item.verseId)} className="text-sm font-medium text-forest underline underline-offset-4">{item.verseId}</Link>
    {item.verseError ? <p className="text-sm text-muted">{item.verseError}</p> : item.verse?.status === 'missing_source_text' ?
      <p className="text-sm text-muted">Source text is unresolved for this reference.</p> :
      <blockquote className="whitespace-pre-wrap break-words font-serif text-lg leading-8 text-charcoal">{item.verse?.text}</blockquote>}
  </div>;
}
