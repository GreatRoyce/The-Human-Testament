import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { readingService, readingLocationLabel, readingLocationUrl } from '../../services/reading.service.js';
import { useResource } from '../../hooks/useResource.js';
import ResourceState from '../shared/ResourceState.jsx';
import LibraryLoginPrompt from '../../features/reader/components/LibraryLoginPrompt.jsx';
export function ContinueReadingContent({ items, bookId }) {
  return <div className="space-y-3 text-sm leading-7 text-muted">
    {items.length ? items.map((item, index) => <p key={item.bookId}>
      <Link to={readingLocationUrl(item)} className="text-forest underline underline-offset-4">{index === 0 ? 'Continue reading' : 'Resume'}: {readingLocationLabel(item)}</Link>
    </p>) : <p>No reading position saved yet. <Link to={`/testament/${bookId ?? 'inquiry'}/1`} className="text-forest underline underline-offset-4">Start reading</Link></p>}
    <p><Link to={bookId ? `/reading/history?bookId=${encodeURIComponent(bookId)}` : '/reading/history'} className="text-forest underline underline-offset-4">Reading history</Link></p>
  </div>;
}
export default function ContinueReading({ bookId }) {
  const load = useCallback(async options => {
    if (!bookId) return readingService.list(options);
    const item = await readingService.get(bookId, options);
    return item ? [item] : [];
  }, [bookId]);
  const resource = useResource(load, `continue:${bookId ?? 'all'}`);
  return <section aria-label="Continue reading" className="my-7 space-y-4 rounded-soft border border-border p-5 sm:p-7">
    <h2 className="font-serif text-2xl text-forest">Continue reading</h2>
    {resource.error?.status === 401 ? <LibraryLoginPrompt action="resume reading across devices and view your reading history" /> :
      <ResourceState resource={resource}>{resource.data && <ContinueReadingContent items={resource.data} bookId={bookId} />}</ResourceState>}
  </section>;
}
