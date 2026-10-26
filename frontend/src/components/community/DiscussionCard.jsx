import { Link } from 'react-router-dom';
import { panel } from './CommunityUI.jsx';
export default function DiscussionCard({ discussion }) {
  return <article className={panel} aria-label="Reader discussion">
    <p className="text-xs uppercase tracking-widest text-bronze-ink">Reader contribution · {discussion.status}</p>
    <h2 className="break-words font-serif text-2xl text-forest"><Link className="underline" to={'/community/discussions/' + discussion.id}>{discussion.title}</Link></h2>
    <p className="text-sm text-muted">By {discussion.author.displayName} · {discussion.commentCount} comments</p>
    {discussion.verseId && <p className="text-xs text-forest">Passage: {discussion.verseId}</p>}
    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-charcoal">{discussion.body.slice(0, 280)}{discussion.body.length > 280 ? '…' : ''}</p>
  </article>;
}
