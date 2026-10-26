import { useState } from 'react';
import Button from '../ui/Button.jsx';
import SavedPassage from '../../features/reader/components/SavedPassage.jsx';
export default function SavedVerseCard({ item, onRemove }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    if (busy) return;
    setBusy(true); setError('');
    try { await onRemove(item.verseId); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <article className="space-y-4 rounded-soft border border-border p-5 sm:p-7">
    <SavedPassage item={item} />
    <p className="text-xs text-muted">Saved <time dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time></p>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <Button variant="secondary" size="lg" className="text-sm" loading={busy} onClick={remove}>Remove saved verse</Button>
  </article>;
}
