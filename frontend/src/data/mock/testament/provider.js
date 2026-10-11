import legacyBooks from './books.js';
import { featuredVerses } from './featuredVerses.js';
import { readerSection } from './readerSection.js';
import { verseApparatus } from './verseApparatus.js';
import { ApiError } from '../../../services/api/ApiError.js';

// Only this adapter knows the legacy editorial shapes. No invented chapters/text.
const books = legacyBooks.map((book) => ({
  slug: book.title.toLowerCase(), title: book.title, order: book.id,
  numberLabel: book.number, chapterCount: Number.parseInt(book.subtitle, 10),
  subtitle: book.subtopic, description: book.desc,
}));

function allVerses() {
  const byAddress = new Map();
  const add = (verse) => byAddress.set(`${verse.bookSlug}/${verse.chapterNumber}/${verse.number}`, verse);
  for (const verse of featuredVerses) add({
    bookSlug: verse.book.toLowerCase(), chapterNumber: verse.chapter, number: verse.verse,
    text: verse.text, commentary: null,
  });
  for (const verse of readerSection.preview.verses) add({
    bookSlug: 'freedom', chapterNumber: 10, number: Number(verse.ref.split(':')[1]), text: verse.text,
    commentary: verse.note ? {
      ...verse.note,
      seeAlso: verse.note.seeAlso ? {
        bookSlug: 'inquiry', chapterNumber: 16, verseNumber: 9,
        label: verse.note.seeAlso.ref, text: verse.note.seeAlso.text,
      } : null,
    } : null,
  });
  add({ bookSlug: verseApparatus.bookSlug, chapterNumber: verseApparatus.chapterNumber,
    number: verseApparatus.verseNumber, text: verseApparatus.text, commentary: verseApparatus.commentary });
  // Cross-references are supplied quotations with fixed addresses too.
  for (const verse of [...byAddress.values()]) {
    const reference = verse.commentary?.seeAlso;
    if (reference?.text && !byAddress.has(`${reference.bookSlug}/${reference.chapterNumber}/${reference.verseNumber}`)) {
      add({ bookSlug: reference.bookSlug, chapterNumber: reference.chapterNumber,
        number: reference.verseNumber, text: reference.text, commentary: null });
    }
  }
  return [...byAddress.values()].sort((a, b) =>
    books.findIndex((book) => book.slug === a.bookSlug) - books.findIndex((book) => book.slug === b.bookSlug) ||
    a.chapterNumber - b.chapterNumber || a.number - b.number);
}

function getBook(slug) {
  const book = books.find((entry) => entry.slug === slug);
  if (!book) throw new ApiError('This book is not available.', { code: 'NOT_FOUND', status: 404 });
  return structuredClone(book);
}

function getChapter(slug, number) {
  const book = getBook(slug);
  const verses = allVerses().filter((verse) => verse.bookSlug === slug && verse.chapterNumber === number);
  if (!verses.length || number > book.chapterCount) {
    throw new ApiError('This chapter is not available in the supplied excerpts.', { code: 'NOT_FOUND', status: 404 });
  }
  return structuredClone({ book, chapter: { bookSlug: slug, number, completeness: 'excerpt' }, verses });
}

function getChapters(slug) {
  getBook(slug);
  return [...new Set(allVerses().filter((verse) => verse.bookSlug === slug).map((verse) => verse.chapterNumber))]
    .map((number) => ({ bookSlug: slug, number, completeness: 'excerpt' }));
}

function getVerse(slug, chapter, number) {
  const verse = getChapter(slug, chapter).verses.find((entry) => entry.number === number);
  if (!verse) throw new ApiError('This verse is not available in the supplied excerpts.', { code: 'NOT_FOUND', status: 404 });
  return verse;
}

function search(query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return structuredClone(allVerses().flatMap((verse) => {
    const book = getBook(verse.bookSlug);
    const reference = `${book.title} ${verse.chapterNumber}:${verse.number}`;
    return `${reference} ${verse.text}`.toLocaleLowerCase().includes(normalized)
      ? [{ kind: 'verse', reference, verse }] : [];
  }));
}

export const mockContentProvider = {
  getBooks: () => structuredClone(books), getBook, getChapters, getChapter,
  getVerses: (slug, number) => getChapter(slug, number).verses, getVerse, search,
};
