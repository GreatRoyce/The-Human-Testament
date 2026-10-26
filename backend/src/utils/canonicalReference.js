// The shared PDF-derived corpus is authoritative even when optional legacy
// database content mode is selected. No canonical records are created here.
const manuscript = require('../../../shared/manuscript.json');
const references = new Set(Object.keys(manuscript.referencePages));
const chapters = new Map(manuscript.books.map(book => [book.slug, new Set(book.chapters.map(chapter => chapter.number))]));
const isCanonicalBook = value => typeof value === 'string' && chapters.has(value);
function isCanonicalLocation(bookId, chapterNumber, verseNumber) {
  return isCanonicalBook(bookId) && Number.isSafeInteger(chapterNumber) && chapterNumber > 0 &&
    chapters.get(bookId).has(chapterNumber) && (verseNumber === undefined ||
      (Number.isSafeInteger(verseNumber) && verseNumber > 0 && references.has(`${bookId}:${chapterNumber}:${verseNumber}`)));
}
function requireCanonicalBook(bookId) {
  if (!isCanonicalBook(bookId)) throw Object.assign(new Error('Canonical book not found.'), { status: 404 });
  return bookId;
}
function requireCanonicalLocation(bookId, chapterNumber, verseNumber) {
  if (!isCanonicalLocation(bookId, chapterNumber, verseNumber)) throw Object.assign(new Error('Canonical reading location not found.'), { status: 404 });
}
const isCanonicalReference = value => typeof value === 'string' && references.has(value);
function requireCanonicalReference(value) {
  if (!isCanonicalReference(value)) throw Object.assign(new Error('Canonical verse not found.'), { status: 404 });
  return value;
}
module.exports = { isCanonicalReference, requireCanonicalReference, isCanonicalBook, requireCanonicalBook,
  isCanonicalLocation, requireCanonicalLocation };
