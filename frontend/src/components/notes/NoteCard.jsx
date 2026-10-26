import { useState } from 'react';
import Button from '../ui/Button.jsx';
import NoteEditor from './NoteEditor.jsx';
import SavedPassage from '../../features/reader/components/SavedPassage.jsx';
export default function NoteCard({ item, onSave, onRemove, onUnauthorized }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    if (busy) return;
    setBusy(true); setError('');
    try { await onRemove(item.id); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <article className="space-y-4 rounded-soft border border-border p-5 sm:p-7">
    <SavedPassage item={item} />
    <p className="text-xs text-muted">Private note · Updated <time dateTime={item.updatedAt}>{item.updatedAt.slice(0, 10)}</time></p>
    {editing ? <NoteEditor initialContent={item.content} submitLabel="Save changes" onCancel={() => setEditing(false)}
      onUnauthorized={onUnauthorized} onSave={async content => { await onSave(item.id, content); setEditing(false); }} /> : <>
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-charcoal">{item.content}</p>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="lg" className="text-sm" disabled={busy} onClick={() => setEditing(true)}>Edit note</Button>
        <Button variant="secondary" size="lg" className="text-sm" loading={busy} onClick={remove}>Delete note</Button>
      </div>
    </>}
  </article>;
}
