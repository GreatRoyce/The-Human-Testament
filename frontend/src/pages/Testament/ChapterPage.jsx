import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import ResourceState from '../../components/shared/ResourceState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useChapter } from '../../features/testament/hooks/useChapter.js';
import { useReaderSelection } from '../../features/reader/hooks/useReaderSelection.js';
import ChapterReader from '../../features/reader/components/ChapterReader.jsx';
import ReaderControls from '../../features/reader/components/ReaderControls.jsx';
import { useChapters } from '../../features/testament/hooks/useChapters.js';
import { useBooks } from '../../features/testament/hooks/useBooks.js';
import { useAuth } from '../../hooks/useAuth.js';

function routeNumber(value) { return /^\d+$/.test(value ?? '') ? Number(value) : NaN; }

export default function ChapterPage() {
  const { bookSlug, chapterNumber, verseNumber } = useParams();
  const navigate = useNavigate();
  const { authenticated } = useAuth();
  const resource = useChapter(bookSlug, routeNumber(chapterNumber));
  const chapters = useChapters(bookSlug);
  const books = useBooks();
  const chapterList = chapters.data ?? [];
  const parsedChapterNumber = routeNumber(chapterNumber);
  const currentChapterIndex = chapterList.findIndex(chapter => chapter.number === parsedChapterNumber);
  const previousChapter = chapterList[currentChapterIndex - 1];
  const nextChapter = chapterList[currentChapterIndex + 1];
  const preferredNumber = verseNumber === undefined ? undefined : routeNumber(verseNumber);
  const { selectedVerse, selectVerse } = useReaderSelection(resource.data, preferredNumber);
  const missingVerse = verseNumber !== undefined && !resource.data?.verses.some((verse) => verse.number === preferredNumber);
  const reader = useRef(null), scrolledAddress = useRef('');
  const resumeAddress = verseNumber === undefined ? '' : `${bookSlug}:${chapterNumber}:${verseNumber}`;
  useEffect(() => {
    if (!resumeAddress) { scrolledAddress.current = ''; return; }
    if (!resource.data || missingVerse || scrolledAddress.current === resumeAddress) return;
    const target = reader.current?.querySelector(`li[id$="-verse-${preferredNumber}"]`);
    if (target) { target.scrollIntoView({ block: 'center', behavior: 'auto' }); scrolledAddress.current = resumeAddress; }
  }, [resumeAddress, resource.data, missingVerse, preferredNumber]);
  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-ivory pb-16 pt-24">
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <nav aria-label="Reader context" className="mb-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-forest">
        <Link className="min-h-11 inline-flex items-center underline underline-offset-4" to="/testament">All books</Link>
        <Link className="min-h-11 inline-flex items-center underline underline-offset-4" to={authenticated ? '/dashboard' : '/welcome'}>{authenticated ? 'Reader dashboard' : 'Home'}</Link>
      </nav>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">The Human Testament · Reading room</p>
          <h1 className="mt-2 font-serif text-3xl text-forest sm:text-4xl">{resource.data ? `${resource.data.book.title} ${resource.data.chapter.number}` : 'Read the Testament'}</h1>
          {resource.data?.book.subtitle && <p className="mt-2 text-sm leading-6 text-muted">{resource.data.book.subtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs font-medium text-forest">
            Book
            <select value={(books.data ?? []).some(book => book.slug === bookSlug) ? bookSlug : ''} onChange={event => navigate(`/testament/${event.target.value}/1`)} className="min-h-11 max-w-[16rem] rounded-sm border border-border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest">
              <option value="" disabled>Select a book</option>
              {(books.data ?? []).map(book => <option key={book.slug} value={book.slug}>{book.title}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-forest">
            Chapter
            <select value={currentChapterIndex >= 0 ? parsedChapterNumber : ''} onChange={event => navigate(`/testament/${bookSlug}/${event.target.value}`)} className="min-h-11 rounded-sm border border-border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest">
              <option value="" disabled>Select a chapter</option>
              {chapterList.map(chapter => <option key={chapter.number} value={chapter.number}>{chapter.number}{chapter.completeness === 'excerpt' ? ' · excerpt' : ''}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="mb-5 flex min-h-11 items-center justify-between gap-4 border-y border-border py-2 text-sm">
        {previousChapter ? <Link className="text-forest underline underline-offset-4" to={`/testament/${bookSlug}/${previousChapter.number}`}>← Previous chapter</Link> : <span aria-hidden="true" />}
        {nextChapter ? <Link className="text-forest underline underline-offset-4" to={`/testament/${bookSlug}/${nextChapter.number}`}>Next chapter →</Link> : <span aria-hidden="true" />}
      </div>
    </div>
    <section aria-label="Manuscript chapter" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <ResourceState resource={resource} empty={resource.data?.verses.length === 0} emptyMessage="This chapter has no verses yet.">
        {chapters.error && <p role="alert" className="mb-4 text-sm text-red-800">Chapter navigation could not be loaded. <button type="button" onClick={chapters.retry} className="underline underline-offset-4">Retry</button></p>}
        {missingVerse ? <EmptyState message="This verse is not available. Open the chapter to read the available text." /> : <>
          {resource.data?.chapter.completeness === 'excerpt' && <p className="mb-5 text-sm leading-7 text-muted">This is an excerpt. The full chapter is not available here yet.</p>}
          {resource.data && <div ref={reader}><ChapterReader content={resource.data} selectedVerse={selectedVerse} onSelect={selectVerse} headingLevel={2} /></div>}
          <ReaderControls selectedVerse={selectedVerse} />
        </>}
        {missingVerse && <Link className="text-sm text-forest underline" to={`/testament/${bookSlug}/${chapterNumber}`}>Open chapter</Link>}
      </ResourceState>
    </section>
  </main>;
}
