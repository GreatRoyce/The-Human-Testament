import { Link } from 'react-router-dom';
import { chapterUrl } from '../utils/contentAddress.js';

export default function ChapterNavigation({ bookSlug, chapters, currentNumber }) {
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  return <nav aria-label="Chapter navigation" className="my-6 flex flex-wrap gap-3">
    {sorted.map((chapter) => <Link key={chapter.number} to={chapterUrl(bookSlug, chapter.number)}
      aria-current={chapter.number === currentNumber ? 'page' : undefined}
      className="inline-flex min-h-11 items-center rounded-soft border border-border bg-ivory px-4 py-2 text-sm text-forest hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest">
      Chapter {chapter.number}{chapter.completeness === 'excerpt' ? ' · excerpt' : ''}
    </Link>)}
  </nav>;
}
