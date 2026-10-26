import { Link } from 'react-router-dom';
import Button from '../ui/Button.jsx';
import { readingLocationLabel, readingLocationUrl } from '../../services/reading.service.js';
export default function ReadingHistory({ items, pagination, onPage }) {
  return <div className="max-w-reading space-y-5">
    {items.length === 0 ? <p className="text-sm text-muted">No reading history here yet. Open a chapter to begin.</p> :
      <ol className="space-y-4">{items.map(item => <li key={item.id} className="space-y-2 rounded-soft border border-border p-5">
        <Link to={readingLocationUrl(item)} className="text-sm text-forest underline underline-offset-4">{readingLocationLabel(item)}</Link>
        <p className="text-xs text-muted"><time dateTime={item.visitedAt}>{item.visitedAt.replace('T', ' ').slice(0, 19)} UTC</time></p>
      </li>)}</ol>}
    <nav aria-label="Reading history pages" className="flex flex-wrap items-center gap-4 text-sm text-forest">
      <Button variant="secondary" size="lg" className="text-sm" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</Button>
      <p>Page {pagination.page} of {Math.max(1, pagination.pages)} · {pagination.total} visits</p>
      <Button variant="secondary" size="lg" className="text-sm" disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>Next</Button>
    </nav>
  </div>;
}
