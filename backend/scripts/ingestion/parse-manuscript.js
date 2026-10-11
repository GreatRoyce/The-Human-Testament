const BOOKS = ['INQUIRY', 'FREEDOM', 'POWER', 'SOCIETY', 'IDENTITY', 'RELATIONSHIPS', 'HUMANITY', 'EXISTENCE', 'BELIEF', 'PURPOSE'];
const idFor = (address) => `${address.bookSlug}:${address.chapter}:${address.verse}`;

/** Pure parser. All nonblank lines have exactly one ledger entry; raw text is retained. */
function parseManuscript(rawText) {
  const lines = rawText.replace(/^\uFEFF/, '').split(/\r?\n/);
  const books = [], references = [], unresolvedReferences = [], notes = [], crossReferences = [];
  const indexEntries = [], glossaryEntries = [], sections = [], editorialMarkers = [], ledger = [], errors = [];
  let book = null, chapter = null, verse = null, note = null, outsideSection = null, supporting = null;
  let inCanonical = false, inSupporting = false, begins = 0, ends = 0;
  const fail = (code, message, sourceLine) => errors.push({ category: 'ingestion', code, message, sourceLine });
  const record = (line, kind) => ledger.push({ line, kind });
  const source = (line, raw) => ({ line, raw });

  function flushVerse() {
    if (!verse) return;
    const text = verse.textLines.map((entry) => entry.raw).join('\n');
    const status = text.trim() ? 'authored' : 'missing_source_text';
    const reference = { bookSlug: book.slug, chapter: chapter.number, verse: verse.number, canonicalId: verse.canonicalId,
      status, source: verse.source, editorialFlags: verse.editorialFlags };
    references.push(reference);
    chapter.referenceCount += 1;
    if (status === 'authored') {
      chapter.verses.push({ number: verse.number, text, source: { referenceLine: verse.source.line, textLines: verse.textLines.map((entry) => entry.line) } });
      if (verse.editorialFlags.some((flag) => flag.raw.includes('NO VERSE TEXT IN SOURCE'))) fail('FLAG_TEXT_CONFLICT', `Missing-text flag accompanies authored text at ${verse.canonicalId}.`, verse.source.line);
    } else {
      unresolvedReferences.push({ ...reference, reviewRequired: true, reason: 'No authored verse text in the clean source.' });
    }
    verse = null;
  }

  function flushNote() {
    if (!note) return;
    note.rawText = note.lines.map((entry) => entry.raw).join('\n');
    note.text = note.lines.filter((entry) => entry.kind === 'note_text').map((entry) => entry.raw).join('\n');
    note.type = note.text.match(/^(Definition|Clarification|Context|Reflection)\./)?.[1] ?? null;
    if (!note.text.trim() || !note.type) fail('INVALID_NOTE_TEXT', `Note ${note.noteNumber} has missing text or an unknown label.`, note.source.line);
    delete note.lines;
    notes.push(note); note = null;
  }

  function finishChapter() {
    flushVerse(); flushNote(); chapter = null; supporting = null; inSupporting = false;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i], trimmed = raw.trim(), line = i + 1;
    if (!trimmed) continue; // The edition explicitly defines blank lines as spacing only.
    if (trimmed === '[[CANONICAL BOOKS BEGIN]]') {
      begins += 1; inCanonical = true; outsideSection = null; editorialMarkers.push(source(line, raw)); record(line, 'editorial_marker'); continue;
    }
    if (trimmed === '[[CANONICAL BOOKS END]]') {
      ends += 1; finishChapter(); book = null; inCanonical = false; editorialMarkers.push(source(line, raw)); record(line, 'editorial_marker'); continue;
    }
    if (trimmed.startsWith('[[')) {
      if (!trimmed.endsWith(']]')) fail('MALFORMED_EDITORIAL_MARKER', 'Unclosed editorial marker.', line);
      const parsedNote = trimmed.match(/^\[\[Note (\d+) · (\d+):(\d+)(.*?)\]\]$/);
      if (parsedNote) {
        flushVerse(); flushNote();
        if (!inCanonical || !book || !chapter || !inSupporting) {
          fail('MISPLACED_NOTE_MARKER', 'Note marker is outside chapter supporting material.', line);
          editorialMarkers.push(source(line, raw)); record(line, 'editorial_marker'); continue;
        }
        const inferredAnchor = /PROBABLE ANCHOR/.test(parsedNote[4]);
        note = { noteNumber: Number(parsedNote[1]), book: book.title, bookSlug: book.slug,
          anchor: { bookSlug: book.slug, chapter: Number(parsedNote[2]), verse: Number(parsedNote[3]),
            status: inferredAnchor ? 'inferred' : 'explicit', sourceMarkerPresent: !inferredAnchor,
            evidence: inferredAnchor ? 'clean_edition_probable_anchor' : 'source_footnote_marker', reviewRequired: inferredAnchor },
          inferredAnchor, reviewRequired: inferredAnchor, markerText: raw, source: source(line, raw), lines: [], crossReferenceIds: [] };
        if (note.anchor.chapter !== chapter.number) fail('NOTE_CHAPTER_MISMATCH', `Note ${note.noteNumber} anchors to a different chapter.`, line);
        supporting.lines.push(source(line, raw)); record(line, 'note_marker'); continue;
      }
      if (/^\[\[Note\b/.test(trimmed)) fail('MALFORMED_NOTE_MARKER', 'Unrecognized note marker.', line);
      const apparatus = { ...source(line, raw), context: verse ? verse.canonicalId : note ? `note:${note.noteNumber}` : null };
      editorialMarkers.push(apparatus); record(line, trimmed.startsWith('[[FLAG:') ? 'editorial_flag' : 'editorial_marker');
      if (trimmed.startsWith('[[FLAG:')) {
        if (verse) verse.editorialFlags.push(apparatus);
        else fail('UNATTACHED_EDITORIAL_FLAG', 'Editorial flag has no verse reference.', line);
      } else if (/^\[\[(FRONT|BACK) MATTER:/.test(trimmed)) {
        if (inCanonical) fail('MISPLACED_MATTER_SECTION', 'Front/back matter marker appears in canonical region.', line);
        outsideSection = { kind: trimmed.startsWith('[[FRONT') ? 'front_matter' : 'back_matter', marker: raw, sourceLine: line, lines: [] };
        sections.push(outsideSection);
      } else if (!trimmed.startsWith('[[THE HUMAN TESTAMENT') && trimmed !== '[[END OF EDITION]]') {
        fail('UNKNOWN_EDITORIAL_MARKER', 'Unrecognized editorial apparatus was preserved for review.', line);
      }
      continue;
    }
    if (!inCanonical) {
      if (outsideSection) {
        outsideSection.lines.push(source(line, raw)); record(line, outsideSection.kind);
      } else { record(line, 'unclassified'); fail('UNCLASSIFIED_TEXT', 'Text outside a recognized section.', line); }
      continue;
    }
    if (BOOKS.includes(trimmed)) {
      finishChapter(); book = { title: trimmed, slug: trimmed.toLowerCase(), order: BOOKS.indexOf(trimmed) + 1,
        subtitle: '', source: source(line, raw), subtitleLines: [], chapters: [] };
      books.push(book); record(line, 'book_heading'); continue;
    }
    const heading = trimmed.match(/^CHAPTER (\d+)$/);
    if (heading && book) {
      finishChapter(); chapter = { number: Number(heading[1]), referenceCount: 0, source: source(line, raw), verses: [] };
      book.chapters.push(chapter); record(line, 'chapter_heading'); continue;
    }
    if (!book) { record(line, 'unclassified'); fail('TEXT_BEFORE_BOOK', 'Canonical-region text precedes a book.', line); continue; }
    if (!chapter) {
      book.subtitleLines.push(source(line, raw)); book.subtitle = book.subtitleLines.map((entry) => entry.raw).join('\n'); record(line, 'book_subtitle'); continue;
    }
    if (trimmed === 'Supporting Material') {
      flushVerse(); flushNote(); inSupporting = true;
      supporting = { kind: 'chapter_supporting_material', bookSlug: book.slug, chapter: chapter.number, sourceLine: line, heading: raw, lines: [] };
      sections.push(supporting); record(line, 'supporting_heading'); continue;
    }
    const ref = trimmed.match(/^(\d+):(\d+)$/);
    if (ref && !inSupporting) {
      flushVerse();
      if (Number(ref[1]) !== chapter.number) fail('VERSE_CHAPTER_MISMATCH', `Reference ${trimmed} is under chapter ${chapter.number}.`, line);
      verse = { number: Number(ref[2]), canonicalId: `${book.slug}:${Number(ref[1])}:${Number(ref[2])}`,
        source: source(line, raw), textLines: [], editorialFlags: [] };
      record(line, 'verse_reference'); continue;
    }
    if (inSupporting && note) {
      const kind = trimmed.startsWith('See also:') ? 'note_cross_reference' : 'note_text';
      note.lines.push({ ...source(line, raw), kind }); supporting.lines.push(source(line, raw)); record(line, kind);
      if (kind === 'note_cross_reference') {
        const id = `note:${note.noteNumber}:see-also:${note.crossReferenceIds.length + 1}`;
        crossReferences.push({ id, noteNumber: note.noteNumber, anchor: { bookSlug: book.slug, chapter: note.anchor.chapter, verse: note.anchor.verse }, raw, sourceLine: line });
        note.crossReferenceIds.push(id);
      }
    } else if (verse) {
      verse.textLines.push(source(line, raw)); record(line, 'verse_text');
    } else {
      if (supporting) supporting.lines.push(source(line, raw));
      record(line, 'unclassified'); fail('UNCLASSIFIED_CHAPTER_TEXT', 'Unclassified chapter text was preserved for review.', line);
    }
  }
  finishChapter();
  if (begins !== 1 || ends !== 1 || inCanonical) fail('CANONICAL_BOUNDARIES', 'Exactly one ordered pair of canonical boundary markers is required.');

  for (const entry of sections) {
    if (entry.marker?.startsWith('[[BACK MATTER: CROSS-REFERENCE INDEX')) {
      const content = entry.lines.filter((item) => item.raw.trim() !== 'CROSS-REFERENCE INDEX');
      for (let index = 0; index < content.length; index += 2) {
        const from = content[index], target = content[index + 1];
        if (!target || !target.raw.startsWith('See also:')) { fail('MALFORMED_INDEX_ENTRY', 'Expected an index source/See also pair.', from.line); continue; }
        indexEntries.push({ id: `index:${indexEntries.length + 1}`, rawSource: from.raw, raw: target.raw, sourceLines: [from.line, target.line] });
      }
    } else if (entry.marker?.startsWith('[[BACK MATTER: GLOSSARY')) {
      const content = entry.lines.filter((item) => item.raw.trim() !== 'GLOSSARY');
      for (let index = 0; index < content.length; index += 3) {
        const term = content[index], definition = content[index + 1], tag = content[index + 2];
        if (!definition || !tag || !/^\([A-Za-z]+\)$/.test(tag.raw)) { fail('MALFORMED_GLOSSARY_ENTRY', 'Expected glossary term/definition/book-tag triple.', term.line); continue; }
        glossaryEntries.push({ term: term.raw, definition: definition.raw, bookTag: tag.raw,
          bookSlug: tag.raw.slice(1, -1).toLowerCase(), sourceLines: [term.line, definition.line, tag.line] });
      }
    }
  }
  return { books, references, unresolvedReferences, notes, crossReferences, indexEntries, glossaryEntries,
    sections, editorialMarkers, ledger, errors, lines };
}

module.exports = { parseManuscript, idFor, BOOKS };
