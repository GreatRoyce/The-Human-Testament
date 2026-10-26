export default function VerseList({ content, selectedVerse, onSelect, readerId }) {
  return (
    <ol aria-label={`${content.book.title} chapter ${content.chapter.number} verses`} className="min-w-0 space-y-2 p-3 sm:p-4">
      {content.verses.map((verse) => {
        const isSelected = verse.number === selectedVerse?.number;
        return (
          <li key={verse.number} id={`${readerId}-verse-${verse.number}`}>
            <button type="button" aria-pressed={isSelected} aria-controls={`${readerId}-notes`}
              onClick={() => onSelect(verse.number)}
              className={`grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 rounded-soft border-l-2 px-3 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 motion-reduce:transition-none sm:gap-4 ${isSelected ? 'border-bronze bg-bronze-soft/20' : 'border-transparent hover:bg-ivory/80'}`}>
              <span className="whitespace-nowrap font-mono text-xs text-bronze-ink">
                <span className="sr-only">{content.book.title} </span>{verse.chapterNumber}:{verse.number}
              </span>
              <span className="min-w-0 whitespace-pre-wrap font-serif text-lg leading-relaxed text-charcoal sm:text-xl">
                {verse.status === 'missing_source_text' ? <span className="text-sm text-muted">Source text is missing. This reference remains under review.</span> : verse.text}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
