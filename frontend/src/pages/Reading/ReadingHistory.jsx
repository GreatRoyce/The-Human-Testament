import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import HistoryList from '../../components/reading/ReadingHistory.jsx';
import LibraryLoginPrompt from '../../features/reader/components/LibraryLoginPrompt.jsx';
import { useResource } from '../../hooks/useResource.js';
import { readingService } from '../../services/reading.service.js';
export default function ReadingHistory() {
  const [params, setParams] = useSearchParams();
  const page = /^[1-9][0-9]*$/.test(params.get('page') ?? '') ? Number(params.get('page')) : 1;
  const bookId = params.get('bookId') || undefined;
  const load = useCallback(options => readingService.history({ page, limit: 20, bookId }, options), [page, bookId]);
  const resource = useResource(load, `history:${page}:${bookId ?? ''}`);
  return <ContentPage title="Reading history">
    <nav aria-label="Personal reading navigation" className="mb-6 flex flex-wrap gap-5 text-sm text-forest">
      <Link className="underline underline-offset-4" to="/testament">Continue reading</Link>
      <Link className="underline underline-offset-4" to="/reading/saved-verses">Saved verses</Link>
      <Link className="underline underline-offset-4" to="/reading/notes">Private notes</Link>
      {bookId && <Link className="underline underline-offset-4" to="/reading/history">All books</Link>}
    </nav>
    {resource.error?.status === 401 ? <LibraryLoginPrompt action="view your private reading history" /> :
      <ResourceState resource={resource}>{resource.data && <HistoryList {...resource.data} onPage={next => setParams({ ...(bookId ? { bookId } : {}), page: String(next) })} />}</ResourceState>}
  </ContentPage>;
}
