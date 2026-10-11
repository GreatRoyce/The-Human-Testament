const { idFor, BOOKS } = require('./parse-manuscript');
const { sha256 } = require('./read-validation-report');

function parseTargets(raw, defaultBookSlug, references) {
  let currentBookSlug = defaultBookSlug;
  return raw.replace(/^See also:\s*/, '').split(';').map((part) => {
    const match = part.trim().match(/^(?:([A-Za-z]+)\s+)?(\d+):(\d+)$/);
    if (!match) return { raw: part, status: 'invalid_format', referenceExists: false, authoredTextExists: false };
    if (match[1]) currentBookSlug = match[1].toLowerCase();
    const target = { bookSlug: currentBookSlug, chapter: Number(match[2]), verse: Number(match[3]) };
    const reference = references.get(idFor(target));
    return { ...target, raw: part, referenceExists: Boolean(reference), authoredTextExists: reference?.status === 'authored',
      status: !reference ? 'missing_reference' : reference.status === 'authored' ? 'resolved' : 'unresolved_source_text' };
  });
}

function validateManuscript(parsed, expected) {
  const errors = [...parsed.errors], warnings = [], sourceIssues = [], reportIssues = [], comparisons = [];
  const fail = (code, message, detail) => errors.push({ category: 'ingestion', code, message, detail });
  const issue = (code, message, detail) => {
    const item = { category: 'source', code, message, reviewRequired: true, detail };
    sourceIssues.push(item); warnings.push(item);
  };
  function compare(name, actual, wanted) {
    const passed = JSON.stringify(actual) === JSON.stringify(wanted);
    const summary = (value) => Array.isArray(value) && value.length > 100 ? { count: value.length, sha256: sha256(JSON.stringify(value)) } : value;
    comparisons.push({ name, expected: summary(wanted), actual: summary(actual), passed });
    if (!passed) fail('REPORT_MISMATCH', `${name} does not match the validation report.`, { expected: wanted, actual });
  }
  const compareSet = (name, actual, wanted) => compare(name, [...actual].sort(), [...wanted].sort());
  const references = new Map(parsed.references.map((ref) => [ref.canonicalId, ref]));
  if (references.size !== parsed.references.length) fail('DUPLICATE_REFERENCE', 'Duplicate verse addresses were found.');
  const notesByNumber = new Map(parsed.notes.map((note) => [note.noteNumber, note]));
  if (notesByNumber.size !== parsed.notes.length) fail('DUPLICATE_NOTE', 'Duplicate note numbers were found.');
  const authoredVerses = parsed.books.flatMap((book) => book.chapters.flatMap((chapter) => chapter.verses.map((verse) => ({ ...verse, bookSlug: book.slug, chapter: chapter.number, verse: verse.number }))));
  const counts = {
    books: parsed.books.length, chapters: parsed.books.reduce((sum, book) => sum + book.chapters.length, 0),
    references: parsed.references.length, authoredVerses: authoredVerses.length, unresolvedReferences: parsed.unresolvedReferences.length,
    notes: parsed.notes.length, explicitAnchors: parsed.notes.filter((note) => note.anchor.status === 'explicit').length,
    inferredAnchors: parsed.notes.filter((note) => note.anchor.status === 'inferred').length,
    noteCrossReferences: parsed.crossReferences.length, indexEntries: parsed.indexEntries.length, glossaryEntries: parsed.glossaryEntries.length,
  };
  for (const [key, value] of Object.entries(expected.counts)) compare(key, counts[key], value);
  compare('book order', parsed.books.map((book) => book.title), expected.books.map((book) => book.title));
  const actualEmpty = parsed.unresolvedReferences.map(idFor);
  compareSet('empty reference identities', actualEmpty, expected.emptyReferences.map(idFor));
  const noTextFlags = parsed.editorialMarkers.filter((marker) => marker.raw.startsWith('[[FLAG: NO VERSE TEXT IN SOURCE'));
  compare('missing-text flag count', noTextFlags.length, expected.counts.unresolvedReferences);
  compareSet('missing-text flag identities', noTextFlags.map((marker) => marker.context), expected.emptyReferences.map(idFor));
  compare('note number sequence', parsed.notes.map((note) => note.noteNumber), Array.from({ length: expected.counts.notes }, (_, index) => index + 1));
  compareSet('inferred note numbers', parsed.notes.filter((note) => note.inferredAnchor).map((note) => note.noteNumber), expected.emptyReferences.map((ref) => ref.noteNumber));
  const noteTypeCounts = Object.fromEntries(Object.keys(expected.noteTypeCounts).map((type) => [type, parsed.notes.filter((note) => note.type === type).length]));
  compare('note labels', noteTypeCounts, expected.noteTypeCounts);
  const nonBlankLines = parsed.lines.map((raw, index) => ({ raw, line: index + 1 })).filter((entry) => entry.raw.trim());
  compare('nonblank source lines', nonBlankLines.length, expected.nonBlankLineCount);
  compareSet('line accounting', parsed.ledger.map((entry) => entry.line), nonBlankLines.map((entry) => entry.line));
  if (new Set(parsed.ledger.map((entry) => entry.line)).size !== parsed.ledger.length) fail('DUPLICATE_LINE_CLASSIFICATION', 'A source line was classified more than once.');

  const bookSummary = parsed.books.map((book) => {
    const wanted = expected.books.find((entry) => entry.slug === book.slug);
    const refs = parsed.references.filter((ref) => ref.bookSlug === book.slug);
    const notes = parsed.notes.filter((note) => note.bookSlug === book.slug);
    compare(`${book.title} chapter sequence`, book.chapters.map((chapter) => chapter.number), (expected.chapterCounts[book.slug] ?? []).map((chapter) => chapter.number));
    if (wanted) {
      compare(`${book.title} reference count`, refs.length, wanted.references);
      compare(`${book.title} missing-text count`, refs.filter((ref) => ref.status === 'missing_source_text').length, wanted.unresolvedReferences);
      compare(`${book.title} note count`, notes.length, wanted.notes);
      compare(`${book.title} subtitle`, book.subtitle, wanted.subtitle);
    }
    const chapterDetails = book.chapters.map((chapter) => {
      const chapterRefs = refs.filter((ref) => ref.chapter === chapter.number);
      const referenceCount = expected.chapterCounts[book.slug]?.find((entry) => entry.number === chapter.number)?.references;
      compare(`${book.title} ${chapter.number} references`, chapterRefs.map((ref) => ref.verse), Array.from({ length: referenceCount ?? 0 }, (_, index) => index + 1));
      return { chapter: chapter.number, references: chapterRefs.length, authoredVerses: chapter.verses.length,
        unresolvedReferences: chapterRefs.filter((ref) => ref.status !== 'authored').length };
    });
    return { title: book.title, slug: book.slug, chapters: book.chapters.length, references: refs.length,
      authoredVerses: chapterDetails.reduce((sum, chapter) => sum + chapter.authoredVerses, 0), unresolvedReferences: refs.filter((ref) => ref.status !== 'authored').length, notes: notes.length, chapterDetails };
  });

  for (const ref of parsed.unresolvedReferences) {
    const reportRef = expected.emptyReferences.find((entry) => idFor(entry) === idFor(ref));
    ref.validationReport = reportRef ? { section: '6.1', sourcePage: reportRef.sourcePage, probableNoteNumber: reportRef.noteNumber } : null;
    issue('MISSING_SOURCE_TEXT', `No authored text at ${idFor(ref)}.`, { reference: idFor(ref), sourceLine: ref.source.line, report: ref.validationReport });
  }
  for (const note of parsed.notes) {
    const reference = references.get(idFor(note.anchor));
    note.anchor.referenceExists = Boolean(reference);
    note.anchor.authoredTextExists = reference?.status === 'authored';
    if (!reference) fail('MISSING_NOTE_ANCHOR', `Note ${note.noteNumber} points outside the source reference inventory.`, note.anchor);
    if (note.inferredAnchor) {
      const reportRef = expected.emptyReferences.find((ref) => ref.noteNumber === note.noteNumber);
      compare(`note ${note.noteNumber} probable anchor`, idFor(note.anchor), reportRef ? idFor(reportRef) : null);
      if (reportRef) compare(`note ${note.noteNumber} text`, note.text, reportRef.noteText);
      issue('INFERRED_NOTE_ANCHOR', `Note ${note.noteNumber} has no original footnote marker; its anchor still requires review.`, { noteNumber: note.noteNumber, anchor: idFor(note.anchor), sourceLine: note.source.line });
    }
  }

  for (const crossReference of parsed.crossReferences) {
    crossReference.targets = parseTargets(crossReference.raw, crossReference.anchor.bookSlug, references);
    crossReference.reviewRequired = crossReference.targets.some((target) => !target.referenceExists);
    for (const target of crossReference.targets.filter((entry) => !entry.referenceExists)) {
      issue('INVALID_CROSS_REFERENCE_TARGET', `Note ${crossReference.noteNumber} cites a nonexistent or malformed target.`, { noteNumber: crossReference.noteNumber, raw: crossReference.raw, target, sourceLine: crossReference.sourceLine });
    }
  }
  const invalidCrossReferences = parsed.crossReferences.filter((ref) => ref.reviewRequired);
  compareSet('invalid cross-reference note numbers', invalidCrossReferences.map((ref) => ref.noteNumber), expected.invalidCrossReferences.map((ref) => ref.noteNumber));
  for (const wanted of expected.invalidCrossReferences) {
    const actual = invalidCrossReferences.find((ref) => ref.noteNumber === wanted.noteNumber);
    if (actual) {
      compare(`invalid reference ${wanted.noteNumber} anchor`, idFor(actual.anchor), idFor(wanted.anchor));
      const reported = parseTargets(wanted.rawCitation.replace(/\s*\(index:.*$/, ''), wanted.anchor.bookSlug, references);
      compare(`invalid reference ${wanted.noteNumber} targets`, actual.targets.map(idFor), reported.map(idFor));
    }
    const explanation = wanted.explanation.match(/([A-Za-z]+) chapter (\d+) has only (\d+) verses/);
    if (explanation) {
      const declared = Number(explanation[3]);
      const structuredCount = expected.chapterCounts[explanation[1].toLowerCase()]?.find((entry) => entry.number === Number(explanation[2]))?.references;
      if (declared !== structuredCount) {
        const item = { category: 'validation_report', code: 'REPORT_INTERNAL_INCONSISTENCY', reviewRequired: true,
          message: `Report section 6.2 describes ${explanation[1]} ${explanation[2]} as ${declared} verses; section 4 lists ${structuredCount}.`,
          detail: { noteNumber: wanted.noteNumber, rawExplanation: wanted.explanation, chapterTableCount: structuredCount } };
        reportIssues.push(item); warnings.push(item);
      }
    }
  }
  for (const entry of parsed.indexEntries) {
    const match = entry.rawSource.match(/^([A-Za-z]+) (\d+):(\d+)$/);
    if (!match) { fail('INVALID_INDEX_SOURCE', 'Index source address is malformed.', entry); continue; }
    entry.anchor = { bookSlug: match[1].toLowerCase(), chapter: Number(match[2]), verse: Number(match[3]) };
    entry.targets = parseTargets(entry.raw, entry.anchor.bookSlug, references);
    const matches = parsed.crossReferences.filter((ref) => idFor(ref.anchor) === idFor(entry.anchor) &&
      JSON.stringify(ref.targets.map(idFor)) === JSON.stringify(entry.targets.map(idFor)));
    entry.matchedNoteNumber = matches.length === 1 ? matches[0].noteNumber : null;
    entry.reviewRequired = entry.targets.some((target) => !target.referenceExists);
    if (!references.has(idFor(entry.anchor)) || matches.length !== 1) fail('INDEX_NOTE_MISMATCH', 'Index entry does not match exactly one note citation.', entry);
    const note = notesByNumber.get(entry.matchedNoteNumber);
    if (note) note.anchor.indexCorroborated = true;
  }
  compareSet('index to note coverage', parsed.indexEntries.map((entry) => entry.matchedNoteNumber), parsed.crossReferences.map((ref) => ref.noteNumber));
  for (const ref of expected.emptyReferences) {
    const note = notesByNumber.get(ref.noteNumber);
    if (note) compare(`note ${ref.noteNumber} index corroboration`, Boolean(note.anchor.indexCorroborated), ref.indexCorroboration);
  }
  for (const note of parsed.notes) note.anchor.indexCorroborated ??= false;
  for (const entry of parsed.glossaryEntries) if (!BOOKS.includes(entry.bookSlug.toUpperCase())) fail('UNKNOWN_GLOSSARY_BOOK', 'Unknown glossary book attribution.', entry);
  if (new Set(parsed.glossaryEntries.map((entry) => entry.term)).size !== parsed.glossaryEntries.length) fail('DUPLICATE_GLOSSARY_TERM', 'Duplicate glossary terms require inspection.');

  const textGroups = new Map();
  for (const verse of authoredVerses) {
    const group = textGroups.get(verse.text) ?? []; group.push(idFor(verse)); textGroups.set(verse.text, group);
  }
  const repeatedPassages = [...textGroups.entries()].filter(([, refs]) => refs.length > 1).map(([text, refs]) => ({ text, references: refs, reviewRequired: true }));
  const pairKey = (left, right) => [left, right].sort().join(' = ');
  const actualPairs = repeatedPassages.flatMap((group) => group.references.flatMap((ref, index) => group.references.slice(index + 1).map((other) => pairKey(ref, other))));
  compareSet('repeated passage identities', actualPairs, expected.repeatedPairs.map(([left, right]) => pairKey(idFor(left), idFor(right))));
  for (const group of repeatedPassages) issue('REPEATED_SOURCE_PASSAGE', 'Identical authored passages retained at distinct source addresses.', { references: group.references });
  const legacyNotes = parsed.notes.filter((note) => /\b(?:Seeker|Responsibility)\s+\d+:\d+/.test(note.text));
  compareSet('legacy book-name note numbers', legacyNotes.map((note) => note.noteNumber), expected.legacyNotes.map((note) => note.noteNumber));
  for (const wanted of expected.legacyNotes) {
    const note = notesByNumber.get(wanted.noteNumber);
    if (note) {
      compare(`legacy note ${wanted.noteNumber} citation`, note.text.includes(wanted.originalCitation), true);
      compare(`legacy note ${wanted.noteNumber} anchor`, idFor(note.anchor), idFor(wanted.anchor));
      compare(`legacy note ${wanted.noteNumber} See also`, parsed.crossReferences.find((ref) => ref.noteNumber === wanted.noteNumber)?.raw, wanted.seeAlso);
    }
  }
  for (const note of legacyNotes) issue('LEGACY_BOOK_NAME', `Note ${note.noteNumber} retains a legacy book name in its authored prose.`, { noteNumber: note.noteNumber, sourceLine: note.source.line });
  for (const note of parsed.notes) {
    note.reviewReasons = [
      ...(note.inferredAnchor ? ['inferred_anchor'] : []),
      ...(invalidCrossReferences.some((ref) => ref.noteNumber === note.noteNumber) ? ['invalid_cross_reference_target'] : []),
      ...(legacyNotes.includes(note) ? ['legacy_book_name'] : []),
    ];
    note.reviewRequired = note.reviewReasons.length > 0;
  }
  issue('PUNCTUATION_REVIEW', 'Punctuation inconsistencies were preserved without correction.', { reportSection: '6.4', rawReportText: expected.punctuationReview });
  for (const join of expected.inferredJoins) {
    const verse = authoredVerses.find((entry) => idFor(entry) === idFor(join));
    compare(`inferred line join ${idFor(join)} ${join.joinedText}`, Boolean(verse?.text.includes(join.joinedText)), true);
    issue('INFERRED_SOURCE_LINE_JOIN', 'The clean edition reports an inferred em-dash join; author review remains outstanding.', { ...join, reportSection: '6.5' });
  }
  const lineAccounting = { nonBlankCount: nonBlankLines.length, classifiedCount: parsed.ledger.length,
    unclassifiedLines: parsed.ledger.filter((entry) => entry.kind === 'unclassified').map((entry) => ({ ...entry, raw: parsed.lines[entry.line - 1] })),
    categories: parsed.ledger.reduce((result, entry) => { result[entry.kind] = (result[entry.kind] ?? 0) + 1; return result; }, {}) };
  return { counts, comparisons, bookSummary, lineAccounting, noTextFlagCount: noTextFlags.length, errors, warnings, sourceIssues, reportIssues, repeatedPassages,
    invalidCrossReferences, legacyNoteNumbers: legacyNotes.map((note) => note.noteNumber),
    reconciliationPassed: errors.length === 0 && comparisons.every((entry) => entry.passed),
    status: errors.length ? 'INGESTION_FAILED' : 'REVIEW_REQUIRED', importApproved: false, databaseModified: false };
}

module.exports = { validateManuscript, parseTargets };
