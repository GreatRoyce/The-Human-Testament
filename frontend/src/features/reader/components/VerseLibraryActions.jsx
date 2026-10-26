import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../../../hooks/useResource.js';
import { bookmarksService } from '../../../services/bookmarks.service.js';
import { notesService } from '../../../services/notes.service.js';
import Button from '../../../components/ui/Button.jsx';
import ResourceState from '../../../components/shared/ResourceState.jsx';
import NoteEditor from '../../../components/notes/NoteEditor.jsx';
import LibraryLoginPrompt from './LibraryLoginPrompt.jsx';
export default function VerseLibraryActions({ verseId }) {
  const load = useCallback(options => bookmarksService.list({ verseId, limit: 1 }, options), [verseId]);
  const state = useResource(load, verseId);
  const [savedOverride, setSavedOverride] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ended, setEnded] = useState(false);
  const saved = savedOverride ?? Boolean(state.data?.items.length);
  async function toggle() {
    if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      if (saved) await bookmarksService.remove(verseId); else await bookmarksService.save(verseId);
      setSavedOverride(!saved); setSuccess(saved ? 'Verse removed from saved verses.' : 'Verse saved.');
    } catch (failure) { if (failure.status === 401) setEnded(true); else setError(failure.message); }
    finally { setBusy(false); }
  }
  if (ended || state.error?.status === 401) return <LibraryLoginPrompt />;
  return <ResourceState resource={state}>
    <section aria-label="Save verse and private notes" className="space-y-5 rounded-soft border border-border p-5 sm:p-7">
      <p className="text-sm text-muted">Selected passage: <span className="font-medium text-forest">{verseId}</span></p>
      <Button variant="secondary" size="lg" className="text-sm" onClick={toggle} loading={busy} aria-pressed={saved}>{saved ? 'Remove saved verse' : 'Save verse'}</Button>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="text-sm text-forest">{success}</p>}
      <NoteEditor onUnauthorized={() => setEnded(true)} onSave={async content => {
        setSuccess(''); await notesService.create({ verseId, content }); setSuccess('Private note saved.');
      }} />
      <Link to={`/reading/notes?verseId=${encodeURIComponent(verseId)}`} className="inline-block text-sm text-forest underline underline-offset-4">View your notes for this passage</Link>
    </section>
  </ResourceState>;
}
