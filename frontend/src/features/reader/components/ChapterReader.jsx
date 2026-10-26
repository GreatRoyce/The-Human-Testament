import { useId } from 'react';
import VerseList from './VerseList.jsx';
import MarginNotes from './MarginNotes.jsx';

/** Presentation only: receives content and selection callbacks, never a provider. */
export default function ChapterReader({ content, selectedVerse, onSelect, labels = {}, headingLevel = 3 }) {
  const readerId = useId();
  const ChapterHeading = `h${headingLevel}`;
  return (
    <div role="group" aria-labelledby={`${readerId}-chapter`} className="min-w-0 overflow-hidden rounded-lg border border-border bg-bronze-soft/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <ChapterHeading id={`${readerId}-chapter`} className="font-mono text-xs font-semibold uppercase leading-5 tracking-wider text-forest">
          {labels.book ?? `BOOK ${content.book.numberLabel} · ${content.book.title}`} / {labels.chapter ?? `CHAPTER ${content.chapter.number}`}
        </ChapterHeading>
        {content.chapter.completeness === 'excerpt' && <span className="rounded-sm border border-bronze/20 bg-ivory/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-bronze-ink">{labels.badge ?? 'Chapter excerpt'}</span>}
      </div>
      {content.chapter.completeness === 'source_incomplete' && <p className="border-b border-border px-4 py-3 text-sm text-muted sm:px-6">This chapter includes references with missing source text. Their notes and review status remain available.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <VerseList content={content} selectedVerse={selectedVerse} onSelect={onSelect} readerId={readerId} />
        <MarginNotes bookTitle={content.book.title} selectedVerse={selectedVerse} readerId={readerId}
          emptyNote={labels.emptyNote ?? 'This verse carries no note. Its meaning rests in the chapter around it.'} headingAs={`h${headingLevel + 1}`} />
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-4 py-4 text-xs leading-5 text-muted sm:px-6">
        <p className="font-medium text-forest">{labels.footerLeft ?? 'Select a verse to open its note'}</p>
        <p>{labels.footerRight ?? 'Notes and cross-references from the printed text'}</p>
      </div>
    </div>
  );
}
