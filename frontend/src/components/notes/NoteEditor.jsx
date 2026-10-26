import { useId, useState } from 'react';
import Button from '../ui/Button.jsx';
import { noteContentError } from '../../services/personalLibrary.js';
export default function NoteEditor({ initialContent = '', onSave, onCancel, onUnauthorized, submitLabel = 'Save private note' }) {
  const id = useId();
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const invalid = noteContentError(content);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError('');
    try { await onSave(content); if (!initialContent) setContent(''); }
    catch (failure) { if (failure.status === 401) onUnauthorized?.(); setError(failure.message || 'The note could not be saved. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} aria-busy={busy} className="space-y-3">
    <label htmlFor={id} className="block text-sm font-medium text-forest">Private note</label>
    <textarea id={id} name="content" rows={5} required maxLength={5000} value={content} disabled={busy}
      onChange={event => { setContent(event.target.value); setError(''); }} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
      aria-invalid={Boolean(error)} className="w-full rounded-sm border border-border bg-white p-3 text-sm leading-7 text-charcoal focus:outline-none focus:ring-2 focus:ring-forest" />
    <p id={`${id}-hint`} className="text-xs text-muted">Only you can see this note. Up to 5,000 characters. {content.length.toLocaleString()} / 5,000</p>
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" size="lg" className="text-sm" loading={busy} rightIcon={null}>{submitLabel}</Button>
      {onCancel && <Button size="lg" variant="secondary" className="text-sm" disabled={busy} onClick={onCancel}>Cancel</Button>}
    </div>
  </form>;
}
