import { Link, useParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useChapter } from '../../features/testament/hooks/useChapter.js';
import { useReaderSelection } from '../../features/reader/hooks/useReaderSelection.js';
import ChapterReader from '../../features/reader/components/ChapterReader.jsx';
import ReaderControls from '../../features/reader/components/ReaderControls.jsx';
import { useChapters } from '../../features/testament/hooks/useChapters.js';
import ChapterNavigation from '../../features/testament/components/ChapterNavigation.jsx';

function routeNumber(value) { return /^\d+$/.test(value ?? '') ? Number(value) : NaN; }

export default function ChapterPage() {
  const { bookSlug, chapterNumber, verseNumber } = useParams();
  const resource = useChapter(bookSlug, routeNumber(chapterNumber));
  const chapters = useChapters(bookSlug);
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
  return <ContentPage title={resource.data ? `${resource.data.book.title} ${resource.data.chapter.number}` : 'Chapter'}>
    <Link className="text-sm text-forest underline underline-offset-4" to={`/testament/${bookSlug}`}>Back to book</Link>
    <div className="mt-6">
      <ResourceState resource={resource} empty={resource.data?.verses.length === 0} emptyMessage="This chapter has no verses yet.">
        {missingVerse ? <EmptyState message="This verse is not available. Open the chapter to read the available text." /> : <>
          {resource.data?.chapter.completeness === 'excerpt' && <p className="mb-5 text-sm leading-7 text-muted">This is an excerpt. The full chapter is not available here yet.</p>}
          {resource.data && <div ref={reader}><ChapterReader content={resource.data} selectedVerse={selectedVerse} onSelect={selectVerse} headingLevel={2} /></div>}
          <ReaderControls selectedVerse={selectedVerse} />
          <ResourceState resource={chapters} empty={chapters.data?.length === 0} emptyMessage="No other chapter text is available yet.">
            <ChapterNavigation bookSlug={bookSlug} chapters={chapters.data ?? []} currentNumber={routeNumber(chapterNumber)} />
          </ResourceState>
        </>}
        {missingVerse && <Link className="text-sm text-forest underline" to={`/testament/${bookSlug}/${chapterNumber}`}>Open chapter</Link>}
      </ResourceState>
    </div>
  </ContentPage>;
}
