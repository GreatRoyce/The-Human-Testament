export default function MarginNotes({ bookTitle, selectedVerse, readerId, emptyNote, headingAs: Heading = 'h4' }) {
  const note = selectedVerse?.commentary;
  const notes = selectedVerse?.notes;
  if (notes?.length) return (
    <aside id={`${readerId}-notes`} aria-labelledby={`${readerId}-note-heading`}
      className="min-w-0 border-t border-border bg-ivory/50 p-5 sm:border-l sm:border-t-0">
      <div aria-live="polite" aria-atomic="true">
        {selectedVerse.source?.pdfPage && <p className="mb-3 font-mono text-xs text-muted">PDF page {selectedVerse.source.pdfPages?.join(', ') ?? selectedVerse.source.pdfPage}</p>}
        <Heading id={`${readerId}-note-heading`} className="font-mono text-xs font-semibold leading-5 text-muted">Margin notes</Heading>
        {notes.map(item => <section key={item.noteNumber} className="mt-5">
          <p className="font-mono text-xs text-bronze-ink">Note {item.noteNumber} · {item.type}</p>
          {item.anchor.status === 'inferred' && <p className="mt-2 text-xs text-muted">Anchor inferred · awaiting review</p>}
          {item.reviewRequired && item.anchor.status !== 'inferred' && <p className="mt-2 text-xs text-muted">Source review required</p>}
          <p className="mt-3 whitespace-pre-wrap font-serif text-lg leading-relaxed text-charcoal">{item.text}</p>
          {selectedVerse.crossReferences?.filter(reference => reference.noteNumber === item.noteNumber).map(reference =>
            <div key={reference.id} className="mt-4 border-t border-border pt-4">
              <p className="whitespace-pre-wrap font-mono text-xs text-muted">{reference.raw}</p>
              {reference.reviewRequired && <p className="mt-2 text-xs text-muted">Citation requires review</p>}
            </div>)}
        </section>)}
      </div>
    </aside>
  );
  return (
    <aside id={`${readerId}-notes`} aria-labelledby={`${readerId}-note-heading`}
      className="min-w-0 border-t border-border bg-ivory/50 p-5 sm:border-l sm:border-t-0">
      <div aria-live="polite" aria-atomic="true">
        {selectedVerse?.source?.pdfPage && <p className="mb-3 font-mono text-xs text-muted">PDF page {selectedVerse.source.pdfPages?.join(', ') ?? selectedVerse.source.pdfPage}</p>}
        {selectedVerse && <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-bronze-ink">{bookTitle} {selectedVerse.chapterNumber}:{selectedVerse.number}</p>}
        <Heading id={`${readerId}-note-heading`} className="font-mono text-xs font-semibold leading-5 text-muted">
          {note ? `Note ${note.number} · ${note.type}` : 'Margin note'}
        </Heading>
        {note ? <>
          <p className="mt-3 whitespace-pre-wrap font-serif text-lg leading-relaxed text-charcoal">{note.text}</p>
          {note.seeAlso && <div className="mt-6 border-t border-border pt-4">
            <p className="font-mono text-[10px] uppercase leading-5 tracking-wide text-muted">SEE ALSO · {note.seeAlso.label}</p>
            {note.seeAlso.text && <blockquote className="mt-2 font-serif text-lg leading-relaxed text-charcoal">{note.seeAlso.text}</blockquote>}
          </div>}
        </> : <p className="mt-3 font-serif text-lg leading-relaxed text-muted">{emptyNote}</p>}
      </div>
    </aside>
  );
}
