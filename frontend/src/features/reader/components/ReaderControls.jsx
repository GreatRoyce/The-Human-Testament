import { Link } from 'react-router-dom';
import { verseUrl } from '../../testament/utils/contentAddress.js';
import VerseLibraryActions from './VerseLibraryActions.jsx';
import ReadingProgress from '../../../components/reading/ReadingProgress.jsx';
import NotificationLink from '../../../components/notifications/NotificationLink.jsx';

export default function ReaderControls({ selectedVerse }) {
  return <div className="my-5 space-y-5 text-forest">
    <nav aria-label="Personal reading navigation" className="flex flex-wrap items-center gap-5 text-sm">
      {selectedVerse && <Link className="underline underline-offset-4" to={verseUrl(selectedVerse)}>Open selected verse</Link>}
      <Link className="underline underline-offset-4" to={selectedVerse?.canonicalId ? '/community/discussions?verseId=' + encodeURIComponent(selectedVerse.canonicalId) : '/community/discussions'}>Reader discussions</Link>
      <Link className="underline underline-offset-4" to="/reading/saved-verses">Saved verses</Link>
      <Link className="underline underline-offset-4" to="/reading/notes">Private notes</Link>
      <Link className="underline underline-offset-4" to="/reading/history">Reading history</Link>
      <NotificationLink />
    </nav>
    {selectedVerse?.canonicalId && <ReadingProgress key={selectedVerse.canonicalId} location={{ bookId: selectedVerse.bookSlug, chapterNumber: selectedVerse.chapterNumber, verseNumber: selectedVerse.number }} />}
    {selectedVerse?.canonicalId ? <VerseLibraryActions key={selectedVerse.canonicalId} verseId={selectedVerse.canonicalId} /> :
      <p className="text-xs text-muted">Select a verse to save it or write a private note.</p>}
  </div>;
}
