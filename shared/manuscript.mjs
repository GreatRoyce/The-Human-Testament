// Shared by the browser bundle and the read-only API. Authored strings are never
// normalized here; display titles and address labels are UI metadata only.
import { createPublicSearch } from './search.mjs';
export function createManuscriptProvider(data) {
  const clone = value => structuredClone(value);
  const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
  const number = (value, label) => {
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
      fail(400, 'INVALID_INPUT', `${label} number must be a positive integer.`);
    return Number(value);
  };
  const title = slug => slug[0].toUpperCase() + slug.slice(1);
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const books = data.books.map(book => ({ slug: book.slug, title: title(book.slug), sourceTitle: book.title,
    order: book.order, numberLabel: romans[book.order - 1], chapterCount: book.chapters.length,
    subtitle: book.subtitle, description: '', sourceSha256: data.source.sha256 }));
  const byBook = new Map(books.map(book => [book.slug, book]));
  const byChapter = new Map();
  const byVerse = new Map();
  const at = anchor => `${anchor.bookSlug}:${anchor.chapter}:${anchor.verse}`;
  const group = (items, key) => {
    const result = new Map();
    for (const item of items) { const id = key(item); if (!result.has(id)) result.set(id, []); result.get(id).push(item); }
    return result;
  };
  const notes = group(data.notes, note => at(note.anchor));
  const references = group(data.crossReferences, reference => at(reference.anchor));
  const unresolved = new Map(data.unresolvedReferences.map(reference => [reference.canonicalId, reference]));
  for (const book of data.books) for (const chapter of book.chapters) {
    const authored = new Map(chapter.verses.map(verse => [verse.number, verse]));
    const verses = [];
    for (let value = 1; value <= chapter.referenceCount; value++) {
      const id = `${book.slug}:${chapter.number}:${value}`;
      const verse = authored.get(value), missing = unresolved.get(id), location = data.referencePages[id];
      if ((!verse && !missing) || !location) fail(500, 'CONTENT_INTEGRITY_ERROR', `Missing manuscript record: ${id}`);
      const result = { canonicalId: id, bookSlug: book.slug, chapterNumber: chapter.number, number: value,
        status: verse ? 'authored' : 'missing_source_text',
        ...(verse ? { text: verse.text } : { unresolved: missing }),
        notes: notes.get(id) ?? [], crossReferences: references.get(id) ?? [], commentary: null,
        source: { ...(verse?.source ?? missing.source), pdfPage: location.page, pdfPages: location.pages },
        sourceSha256: data.source.sha256 };
      verses.push(result); byVerse.set(id, result);
    }
    byChapter.set(`${book.slug}:${chapter.number}`, { book: byBook.get(book.slug),
      chapter: { bookSlug: book.slug, number: chapter.number, referenceCount: chapter.referenceCount,
        completeness: verses.some(verse => verse.status === 'missing_source_text') ? 'source_incomplete' : 'complete' },
      verses, notes: verses.flatMap(verse => verse.notes), crossReferences: verses.flatMap(verse => verse.crossReferences),
      sections: data.sections.filter(section => section.bookSlug === book.slug && section.chapter === chapter.number) });
  }
  function getBook(slug) {
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(400, 'INVALID_INPUT', 'Book slug is invalid.');
    if (!byBook.has(slug)) fail(404, 'NOT_FOUND', 'Book not found.');
    return clone(byBook.get(slug));
  }
  function getChapter(slug, value) {
    const chapter = number(value, 'Chapter'); getBook(slug);
    const content = byChapter.get(`${slug}:${chapter}`);
    if (!content) fail(404, 'NOT_FOUND', 'Chapter not found.');
    return clone(content);
  }
  function getVerse(slug, chapter, value) {
    const verse = number(value, 'Verse');
    const content = getChapter(slug, chapter);
    const result = content.verses.find(entry => entry.number === verse);
    if (!result) fail(404, 'NOT_FOUND', 'Verse reference not found.');
    return result;
  }
  let searchIndex;
  const search = () => searchIndex ??= createPublicSearch({ books, chapters: [...byChapter.values()].map(item => item.chapter),
    verses: [...byVerse.values()], notes: data.notes, glossary: data.glossary,
    crossReferences: data.crossReferences, crossReferenceIndex: data.crossReferenceIndex });
  return {
    getBooks: () => clone(books), getBook, getChapter,
    getChapters: slug => { getBook(slug); return clone([...byChapter.values()].filter(entry => entry.book.slug === slug).map(entry => entry.chapter)); },
    getVerses: (slug, chapter) => getChapter(slug, chapter).verses, getVerse,
    getVerseById: id => {
      const match = typeof id === 'string' && id.match(/^([a-z0-9-]+):(\d+):(\d+)$/);
      if (!match) fail(400, 'INVALID_INPUT', 'Canonical verse identity is invalid.');
      return getVerse(match[1], match[2], match[3]);
    },
    getSupporting: (slug, chapter, value) => {
      const verse = getVerse(slug, chapter, value);
      return { canonicalId: verse.canonicalId, status: verse.status, notes: verse.notes, crossReferences: verse.crossReferences };
    },
    getCrossReferences: () => clone(data.crossReferences),
    getIndex: () => clone(data.crossReferenceIndex), getGlossary: () => clone(data.glossary),
    getSections: kind => {
      if (kind && !['front_matter', 'back_matter', 'chapter_supporting_material'].includes(kind)) fail(400, 'INVALID_INPUT', 'Section kind is invalid.');
      return clone(data.sections.filter(section => !kind || section.kind === kind));
    },
    search: query => search().search(query),
    searchPage: (query, filters) => search().searchPage(query, filters),
  };
}
