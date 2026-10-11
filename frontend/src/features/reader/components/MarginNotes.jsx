export default function MarginNotes({ bookTitle, selectedVerse, readerId, emptyNote, headingAs: Heading = 'h4' }) {
  const note = selectedVerse?.commentary;
  return (
    <aside id={`${readerId}-notes`} aria-labelledby={`${readerId}-note-heading`}
      className="min-w-0 border-t border-border bg-ivory/50 p-5 sm:border-l sm:border-t-0">
      <div aria-live="polite" aria-atomic="true">
        {selectedVerse && <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-bronze-ink">{bookTitle} {selectedVerse.chapterNumber}:{selectedVerse.number}</p>}
        <Heading id={`${readerId}-note-heading`} className="font-mono text-xs font-semibold leading-5 text-muted">
          {note ? `Note ${note.number} · ${note.type}` : 'Margin note'}
        </Heading>
        {note ? <>
          <p className="mt-3 font-serif text-lg leading-relaxed text-charcoal">{note.text}</p>
          {note.seeAlso && <div className="mt-6 border-t border-border pt-4">
            <p className="font-mono text-[10px] uppercase leading-5 tracking-wide text-muted">SEE ALSO · {note.seeAlso.label}</p>
            {note.seeAlso.text && <blockquote className="mt-2 font-serif text-lg leading-relaxed text-charcoal">{note.seeAlso.text}</blockquote>}
          </div>}
        </> : <p className="mt-3 font-serif text-lg leading-relaxed text-muted">{emptyNote}</p>}
      </div>
    </aside>
  );
}
