import { Link } from 'react-router-dom';
import { verseUrl } from '../../testament/utils/contentAddress.js';

export default function ReaderControls({ selectedVerse }) {
  return <div className="my-5 flex flex-wrap items-center gap-5 text-sm text-forest">
    {selectedVerse && <Link className="underline underline-offset-4" to={verseUrl(selectedVerse)}>Open selected verse</Link>}
    <p className="text-xs text-muted">Personal bookmarks, highlights, and notes are not available yet.</p>
  </div>;
}
