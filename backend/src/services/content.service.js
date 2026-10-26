const repository = require('../repositories/content.repository');
const { isEditionApproved } = require('./contentApproval');
const mongoose = require('mongoose');
const { createDatabaseSearch } = require('./databaseSearch.service');
function failure(status, message, code) { return Object.assign(new Error(message), { status, code }); }
function number(value, label = 'Chapter') {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    throw failure(400, label + ' number must be a positive integer.', 'INVALID_INPUT');
  return Number(value);
}
function slug(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw failure(400, 'Book slug is invalid.', 'INVALID_INPUT');
  return value;
}
function bookDto(book) {
  const romans = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  return { slug: book.slug, title: book.title, order: book.order, numberLabel: romans[book.order - 1] ?? String(book.order),
    chapterCount: book.chapterCount, subtitle: book.subtitle ?? '', description: book.description ?? '',
    sourceVersion: book.sourceVersion, editionId: book.editionId };
}
function chapterDto(chapter, bookSlug, verses) {
  const completeness = verses ? (verses.length !== chapter.referenceCount ? 'excerpt' :
    verses.some(verse => verse.status === 'missing_source_text') ? 'source_incomplete' : 'complete') : (chapter.completeness ?? 'excerpt');
  return { bookSlug, number: chapter.number, title: chapter.title ?? '', referenceCount: chapter.referenceCount, completeness };
}
function supportDto(record) {
  const { _id, __v, createdAt, updatedAt, isPublished, ...content } = record;
  return content;
}
function verseDto(verse, notes, crossReferences) {
  const address = `${verse.bookSlug}:${verse.chapterNumber}:${verse.number}`;
  const status = verse.status ?? 'authored';
  if (verse.canonicalId !== address || !['authored','missing_source_text'].includes(status) ||
      (status === 'authored' && (typeof verse.text !== 'string' || !verse.text.trim() || /^\s*\[\[/m.test(verse.text))) ||
      (status === 'missing_source_text' && verse.text !== undefined)) throw failure(500, 'Stored content failed integrity validation.', 'CONTENT_INTEGRITY_ERROR');
  const associated = notes.filter(note => note.anchor.verse === verse.number);
  for (const note of associated) {
    if (!['explicit','inferred'].includes(note.anchor.status) || note.anchor.sourceMarkerPresent !== (note.anchor.status === 'explicit') ||
        (note.anchor.status === 'inferred' && note.anchor.reviewRequired !== true) || typeof note.text !== 'string' || typeof note.rawText !== 'string')
      throw failure(500, 'Stored supporting material failed integrity validation.', 'CONTENT_INTEGRITY_ERROR');
  }
  return { canonicalId: address, bookSlug: verse.bookSlug, chapterNumber: verse.chapterNumber, number: verse.number, status,
    ...(status === 'authored' ? { text: verse.text } : { unresolved: verse.unresolved ?? { reviewRequired: true } }),
    notes: associated.map(supportDto), crossReferences: crossReferences.filter(ref => ref.anchor.verse === verse.number).map(supportDto),
    source: verse.source, sourceVersion: verse.sourceVersion, editionId: verse.editionId };
}
async function edition(required = false) {
  const value = await repository.edition();
  if (isEditionApproved(value)) return value;
  if (required) throw failure(404, 'Book not found.', 'NOT_FOUND');
  return null;
}
async function bookContext(bookSlug) {
  slug(bookSlug);
  const current = await edition(true), book = await repository.book(current.editionId, bookSlug);
  if (!book) throw failure(404, 'Book not found.', 'NOT_FOUND');
  return { current, book };
}
async function getChapter(bookSlug, chapterNumber) {
  const chapterValue = number(chapterNumber), { current, book } = await bookContext(bookSlug);
  const chapter = await repository.chapter(current.editionId, book._id, chapterValue);
  if (!chapter) throw failure(404, 'Chapter not found.', 'NOT_FOUND');
  if (chapter.bookSlug !== bookSlug) throw failure(500, 'Stored chapter address failed integrity validation.', 'CONTENT_INTEGRITY_ERROR');
  const [verses, notes, crossReferences, sections] = await Promise.all([
    repository.verses(current.editionId, book._id, chapter._id), repository.notes(current.editionId, bookSlug, chapterValue),
    repository.crossReferences(current.editionId, bookSlug, chapterValue), repository.sections(current.editionId, { bookSlug, chapter: chapterValue }),
  ]);
  if (verses.some(verse => verse.bookSlug !== bookSlug || verse.chapterNumber !== chapterValue))
    throw failure(500, 'Stored verse address failed integrity validation.', 'CONTENT_INTEGRITY_ERROR');
  return { book: bookDto(book), chapter: chapterDto(chapter, bookSlug, verses),
    verses: verses.map(verse => verseDto(verse, notes, crossReferences)), notes: notes.map(supportDto),
    crossReferences: crossReferences.map(supportDto), sections: sections.map(supportDto) };
}
const searchPage = createDatabaseSearch({ getEdition: () => repository.edition(), ready: () => mongoose.connection.readyState === 1,
  namespace: () => `${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`,
  loadSnapshot: async current => {
    const snapshot = await repository.searchSnapshot(current.editionId);
    const incomplete = () => { throw failure(503, 'Published database search is unavailable or incomplete.', 'SEARCH_UNAVAILABLE'); };
    if (!snapshot.books.length || snapshot.books.some(book => snapshot.chapters.filter(chapter => String(chapter.book) === String(book._id)).length !== book.chapterCount)) incomplete();
    const booksById = new Map(snapshot.books.map(book => [String(book._id), book]));
    const chaptersById = new Map(snapshot.chapters.map(chapter => [String(chapter._id), chapter]));
    if (snapshot.chapters.some(chapter => booksById.get(String(chapter.book))?.slug !== chapter.bookSlug) ||
        snapshot.verses.some(verse => {
          const chapter = chaptersById.get(String(verse.chapter));
          return !chapter || String(verse.book) !== String(chapter.book) || booksById.get(String(verse.book))?.slug !== verse.bookSlug;
        })) incomplete();
    const chapterIds = new Set(snapshot.chapters.map(chapter => `${chapter.bookSlug}:${chapter.number}`));
    const verseIds = new Set(snapshot.verses.map(verse => verse.canonicalId));
    const sourceLines = new Set(snapshot.sections.flatMap(section => section.lines.map(line => line.line)));
    for (const chapter of snapshot.chapters) {
      const verses = snapshot.verses.filter(verse => String(verse.chapter) === String(chapter._id));
      if (verses.length !== chapter.referenceCount || new Set(verses.map(verse => verse.number)).size !== chapter.referenceCount ||
          verses.some(verse => verse.number < 1 || verse.number > chapter.referenceCount || verse.bookSlug !== chapter.bookSlug || verse.chapterNumber !== chapter.number)) incomplete();
    }
    if (snapshot.verses.some(verse => !chapterIds.has(`${verse.bookSlug}:${verse.chapterNumber}`)) ||
        snapshot.notes.some(note => !verseIds.has(`${note.anchor?.bookSlug}:${note.anchor?.chapter}:${note.anchor?.verse}`)) ||
        snapshot.glossary.some(entry => !entry.sourceLines?.length || !sourceLines.has(entry.sourceLines[0]) || !snapshot.books.some(book => book.slug === entry.bookSlug)) ||
        snapshot.crossReferenceIndex.some(entry => !entry.sourceLines?.length || !sourceLines.has(entry.sourceLines[0]))) incomplete();
    return { ...snapshot, books: snapshot.books.map(bookDto), chapters: snapshot.chapters.map(chapter => chapterDto(chapter, chapter.bookSlug)),
      verses: snapshot.verses.map(verse => ({ ...verseDto(verse,
        snapshot.notes.filter(note => note.anchor.bookSlug === verse.bookSlug && note.anchor.chapter === verse.chapterNumber),
        snapshot.crossReferences.filter(ref => ref.anchor.bookSlug === verse.bookSlug && ref.anchor.chapter === verse.chapterNumber)), commentary: null })),
      notes: snapshot.notes.map(supportDto), glossary: snapshot.glossary.map(supportDto),
      crossReferences: snapshot.crossReferences.map(supportDto), crossReferenceIndex: snapshot.crossReferenceIndex.map(supportDto) };
  } });
module.exports = {
  searchPage,
  async search(query) { return (await searchPage(query, { type: 'verse' })).items; },
  async getBooks() { const current = await edition(); return current ? (await repository.books(current.editionId)).map(bookDto) : []; },
  async getBook(bookSlug) { const { current, book } = await bookContext(bookSlug);
    return { ...bookDto(book), chapters: (await repository.chapters(current.editionId, book._id)).map(chapter => chapterDto(chapter, bookSlug)) }; },
  async getChapters(bookSlug) { const { current, book } = await bookContext(bookSlug);
    return (await repository.chapters(current.editionId, book._id)).map(chapter => chapterDto(chapter, bookSlug)); },
  getChapter,
  async getVerses(bookSlug, chapterNumber) { return (await getChapter(bookSlug, chapterNumber)).verses; },
  async getVerse(bookSlug, chapterNumber, verseNumber) {
    const value = number(verseNumber, 'Verse'), chapter = await getChapter(bookSlug, chapterNumber);
    const verse = chapter.verses.find(verse => verse.number === value);
    if (!verse) throw failure(404, 'Verse reference not found.', 'NOT_FOUND');
    return verse;
  },
  async getSupporting(bookSlug, chapterNumber, verseNumber) {
    const verse = await this.getVerse(bookSlug, chapterNumber, verseNumber);
    return { canonicalId: verse.canonicalId, status: verse.status, notes: verse.notes, crossReferences: verse.crossReferences };
  },
  async getVerseById(canonicalId) {
    const match = canonicalId.match(/^([a-z0-9-]+):(\d+):(\d+)$/);
    if (!match) throw failure(400, 'Canonical verse identity is invalid.', 'INVALID_INPUT');
    return this.getVerse(match[1], match[2], match[3]);
  },
  async getCrossReferences() { const current = await edition(); return current ? (await repository.crossReferences(current.editionId)).map(supportDto) : []; },
  async getIndex() { const current = await edition(); return current ? (await repository.index(current.editionId)).map(supportDto) : []; },
  async getGlossary() { const current = await edition(); return current ? (await repository.glossary(current.editionId)).map(supportDto) : []; },
  async getSections(kind) {
    if (kind && !['front_matter','back_matter','chapter_supporting_material'].includes(kind)) throw failure(400, 'Section kind is invalid.', 'INVALID_INPUT');
    const current = await edition();
    return current ? (await repository.sections(current.editionId, kind ? { kind } : {})).map(supportDto) : [];
  },
};

