import { useReadingProgress } from '../../hooks/useReadingProgress.js';
import Button from '../ui/Button.jsx';
import LibraryLoginPrompt from '../../features/reader/components/LibraryLoginPrompt.jsx';
export default function ReadingProgress({ location }) {
  const state = useReadingProgress(location);
  if (state.error?.status === 401) return <LibraryLoginPrompt action="save reading progress across devices" />;
  if (state.error) return <div className="space-y-3 text-sm">
    <p role="alert" className="text-red-800">{state.error.message || 'Your reading position could not be saved.'}</p>
    <Button variant="secondary" size="lg" className="text-sm" onClick={state.retry}>Save this location again</Button>
  </div>;
  return <p role="status" className="text-xs leading-6 text-muted">{state.status === 'saved' ? 'Reading position saved. Continue on this or another device after logging in.' : 'Saving reading position after navigation settles…'}</p>;
}
