// Read-only, shared matching for the browser PDF provider and published DB data.
// Normalization applies only to lookup fields, never the returned source records.
const fail = message => { throw Object.assign(new Error(message), { status: 400, code: 'INVALID_INPUT' }); };
const normalize = value => value.replace(/\s+/gu, ' ').trim().toLowerCase();
export const SEARCH_TYPES = ['all', 'verse', 'note', 'glossary', 'cross-reference'];
export function normalizeSearchRequest(query, filters = {}) {
  if (typeof query !== 'string' || query.length > 200) fail('Search query must be text of at most 200 characters.');
  if (/[\u0000-\u0008\u000e-\u001f\u007f]/u.test(query)) fail('Search query contains unsupported control characters.');
  if (!filters || typeof filters !== 'object' || Array.isArray(filters) || Object.keys(filters).some(key => !['book', 'chapter', 'type', 'page', 'limit'].includes(key))) fail('Unknown search filter.');
  let needle = normalize(query), phraseOnly = false;
  if (needle.includes('"')) {
    if (!/^"[^"\n]+"$/u.test(needle)) fail('Use paired outer double quotes for an exact phrase.');
    needle = normalize(needle.slice(1, -1)); phraseOnly = true;
  }
  if (!needle) fail('Enter a nonempty search query.');
  const terms = [...new Set(needle.split(' '))];
  if (terms.length > 32) fail('Use no more than 32 search terms.');
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (!['string', 'number'].includes(typeof value) || !/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > max) fail('Search page, limit and chapter must be positive integers within their limits.');
    return Number(value);
  };
  const book = filters.book === '' ? undefined : filters.book;
  if (book !== undefined && (typeof book !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(book))) fail('Book filter must be a canonical book slug.');
  const chapter = integer(filters.chapter === '' ? undefined : filters.chapter, undefined, 10000);
  if (chapter !== undefined && !book) fail('Choose a book before filtering by chapter.');
  const type = filters.type ?? 'all';
  if (!SEARCH_TYPES.includes(type)) fail('Unsupported search content type.');
  return { query: query.trim().replace(/\s+/gu, ' '), needle, phraseOnly, terms, book, chapter, type,
    page: integer(filters.page, 1, 10000), limit: integer(filters.limit, 20, 50) };
}
export function createPublicSearch({ books, chapters, verses, notes, glossary, crossReferences, crossReferenceIndex }) {
  const bookMap = new Map(books.map(book => [book.slug, book]));
  const chapterIds = new Set(chapters.map(chapter => `${chapter.bookSlug}:${chapter.number}`));
  const verseIds = new Set(verses.map(verse => verse.canonicalId));
  const noteMap = new Map(notes.map(note => [note.noteNumber, note]));
  const rows = [];
  const reference = (book, chapter, verse) => `${bookMap.get(book)?.title ?? book} ${chapter}:${verse}`;
  const add = (result, book, chapter, verse, labels, text) => {
    const normalizedLabels = labels.filter(value => typeof value === 'string').map(normalize);
    rows.push({ result, book, chapter, verse, order: bookMap.get(book)?.order ?? 999,
      labels: normalizedLabels, body: normalize(text), combined: normalize([...labels, text].join(' ')) });
  };
  for (const verse of verses) {
    const label = reference(verse.bookSlug, verse.chapterNumber, verse.number);
    add({ id: `verse:${verse.canonicalId}`, kind: 'verse', reference: label, verse }, verse.bookSlug, verse.chapterNumber, verse.number,
      [label, verse.canonicalId], verse.text ?? '');
  }
  for (const note of notes) {
    const { bookSlug, chapter, verse } = note.anchor;
    const label = `Note ${note.noteNumber} · ${reference(bookSlug, chapter, verse)}`;
    add({ id: `note:${note.noteNumber}`, kind: 'note', reference: label, note }, bookSlug, chapter, verse,
      [label, `${bookSlug}:${chapter}:${verse}`, `Note ${note.noteNumber}`, note.markerText], note.rawText);
  }
  for (const entry of glossary) add({ id: `glossary:${entry.sourceLines[0]}`, kind: 'glossary', reference: entry.term, entry },
    entry.bookSlug, undefined, undefined, [entry.term, entry.bookTag], entry.definition);
  for (const [origin, entries] of [['note', crossReferences], ['index', crossReferenceIndex]]) for (const entry of entries) {
    const anchor = entry.anchor, candidate = noteMap.get(entry.noteNumber ?? entry.matchedNoteNumber);
    const note = candidate && anchor && candidate.anchor.bookSlug === anchor.bookSlug && candidate.anchor.chapter === anchor.chapter && candidate.anchor.verse === anchor.verse ? candidate : undefined;
    const anchorExists = anchor && verseIds.has(`${anchor.bookSlug}:${anchor.chapter}:${anchor.verse}`);
    const label = origin === 'index' ? entry.rawSource : reference(anchor.bookSlug, anchor.chapter, anchor.verse);
    add({ id: `cross-reference:${origin}:${entry.id}`, kind: 'cross-reference', origin, reference: label, entry,
      anchorStatus: note?.anchor.status ?? 'unverified', anchorExists: Boolean(anchorExists),
      reviewRequired: Boolean(entry.reviewRequired || note?.anchor.reviewRequired || !anchorExists || !note) },
    anchor?.bookSlug, anchor?.chapter, anchor?.verse,
    [label, entry.raw, ...(anchor ? [`${anchor.bookSlug}:${anchor.chapter}:${anchor.verse}`] : []),
      ...(entry.targets ?? []).flatMap(target => [target.raw, ...(target.referenceExists ?
        [reference(target.bookSlug, target.chapter, target.verse), `${target.bookSlug}:${target.chapter}:${target.verse}`] : [])])], entry.raw);
  }
  function matches(request) {
    if (request.book && !bookMap.has(request.book)) fail('Book filter does not exist in this manuscript source.');
    if (request.chapter && !chapterIds.has(`${request.book}:${request.chapter}`)) fail('Chapter filter does not exist in this book.');
    const found = [];
    for (const row of rows) {
      if ((request.type !== 'all' && row.result.kind !== request.type) || (request.book && row.book !== request.book) ||
          (request.chapter !== undefined && row.chapter !== request.chapter)) continue;
      const exact = row.labels.includes(request.needle) || row.body === request.needle;
      const phrase = row.labels.some(label => label.includes(request.needle)) || row.body.includes(request.needle);
      if (!exact && !phrase && (request.phraseOnly || !request.terms.every(term => row.combined.includes(term)))) continue;
      found.push({ row, rank: exact ? 3 : phrase ? 2 : 1 });
    }
    const kinds = { verse: 0, note: 1, glossary: 2, 'cross-reference': 3 };
    found.sort((a, b) => b.rank - a.rank || a.row.order - b.row.order || (a.row.chapter ?? Infinity) - (b.row.chapter ?? Infinity) ||
      (a.row.verse ?? Infinity) - (b.row.verse ?? Infinity) || kinds[a.row.result.kind] - kinds[b.row.result.kind] ||
      (a.row.result.id < b.row.result.id ? -1 : a.row.result.id > b.row.result.id ? 1 : 0));
    return found.map(({ row, rank }) => ({ ...row.result, match: rank === 3 ? 'exact' : rank === 2 ? 'phrase' : 'terms' }));
  }
  return {
    searchPage(query, filters) {
      const request = normalizeSearchRequest(query, filters), found = matches(request);
      return structuredClone({ items: found.slice((request.page - 1) * request.limit, request.page * request.limit),
        pagination: { page: request.page, limit: request.limit, total: found.length, pages: Math.ceil(found.length / request.limit) } });
    },
    // Preserve the original local provider's verse-array API. HTTP/UI search is
    // always paginated; this bounded corpus compatibility wrapper shares matches.
    search(query) {
      if (typeof query === 'string' && !query.trim()) return [];
      return structuredClone(matches(normalizeSearchRequest(query, { type: 'verse' })));
    },
  };
}
