import { Link } from 'react-router-dom';
import { panel } from './CommunityUI.jsx';
export default function ReadingCircleCard({ circle }) {
  return <article className={panel}><p className="text-xs uppercase tracking-widest text-bronze-ink">{circle.visibility} circle · {circle.status}</p>
    <h2 className="break-words font-serif text-2xl text-forest">{circle.membership?.status === 'pending' ? circle.name : <Link className="underline" to={'/community/reading-circles/' + circle.id}>{circle.name}</Link>}</h2>
    <p className="text-sm text-muted">Owned by {circle.owner.displayName} · {circle.membershipPolicy === 'open' ? 'Open membership' : 'By invitation'}</p>
    <p className="whitespace-pre-wrap break-words text-sm leading-7">{circle.description}</p>
  </article>;
}
