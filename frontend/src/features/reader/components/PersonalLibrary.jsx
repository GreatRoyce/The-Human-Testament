import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ContentPage from '../../../components/layout/ContentPage.jsx';
import ResourceState from '../../../components/shared/ResourceState.jsx';
import Button from '../../../components/ui/Button.jsx';
import SavedVerseCard from '../../../components/reading/SavedVerseCard.jsx';
import NoteCard from '../../../components/notes/NoteCard.jsx';
import { useResource } from '../../../hooks/useResource.js';
import { bookmarksService } from '../../../services/bookmarks.service.js';
import { notesService } from '../../../services/notes.service.js';
import { resolveLibraryVerses } from '../../../services/personalLibrary.js';
import LibraryLoginPrompt from './LibraryLoginPrompt.jsx';
export default function PersonalLibrary({ notes = false }) {
  const [params, setParams] = useSearchParams();
  const page = /^[1-9][0-9]*$/.test(params.get('page') ?? '') ? Number(params.get('page')) : 1;
  const verseId = params.get('verseId') || undefined;
  const [ended, setEnded] = useState(false);
  const [success, setSuccess] = useState('');
  const service = notes ? notesService : bookmarksService;
  const load = useCallback(async options => {
    const result = await service.list({ page, limit: 20, verseId }, options);
    return { ...result, items: await resolveLibraryVerses(result.items, options) };
  }, [service, page, verseId]);
  const resource = useResource(load, `${notes}:${page}:${verseId ?? ''}`);
  const expired = ended || resource.error?.status === 401;
  async function write(operation, message) {
    setSuccess('');
    try { await operation(); setSuccess(message); resource.retry(); }
    catch (error) { if (error.status === 401) setEnded(true); throw error; }
  }
  function changePage(next) {
    setSuccess('');
    setParams({ ...(verseId ? { verseId } : {}), page: String(next) });
  }
  return <ContentPage title={notes ? 'Private notes' : 'Saved verses'}>
    <nav className="mb-6 flex flex-wrap gap-5 text-sm text-forest" aria-label="Personal reading navigation">
      <Link className="underline underline-offset-4" to={notes ? '/reading/saved-verses' : '/reading/notes'}>{notes ? 'Saved verses' : 'Private notes'}</Link>
      <Link className="underline underline-offset-4" to="/account/settings">Account settings</Link>
      {verseId && <Link className="underline underline-offset-4" to={notes ? '/reading/notes' : '/reading/saved-verses'}>Show all passages</Link>}
    </nav>
    {expired ? <LibraryLoginPrompt /> : <>
      {success && <p role="status" className="mb-5 text-sm text-forest">{success}</p>}
      <ResourceState resource={resource}>
        <div className="max-w-reading space-y-6">
          {resource.data?.items.length === 0 && <p className="text-sm text-muted">{notes ? 'No private notes here yet. Select a verse in the reader to write one.' : 'No saved verses here yet. Select a verse in the reader to save it.'}</p>}
          {resource.data?.items.map(item => notes ? <NoteCard key={item.id} item={item} onUnauthorized={() => setEnded(true)}
            onSave={(id, content) => write(() => notesService.update(id, { content }), 'Private note updated.')}
            onRemove={id => write(() => notesService.remove(id), 'Private note deleted.')} /> :
            <SavedVerseCard key={item.id} item={item} onRemove={id => write(() => bookmarksService.remove(id), 'Verse removed from saved verses.')} />)}
          {resource.data && <nav aria-label="Library pages" className="flex flex-wrap items-center gap-4 text-sm text-forest">
            <Button variant="secondary" size="lg" className="text-sm" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</Button>
            <p>Page {page} of {Math.max(1, resource.data.pagination.pages)} · {resource.data.pagination.total} items</p>
            <Button variant="secondary" size="lg" className="text-sm" disabled={page >= resource.data.pagination.pages} onClick={() => changePage(page + 1)}>Next</Button>
          </nav>}
        </div>
      </ResourceState>
    </>}
  </ContentPage>;
}
