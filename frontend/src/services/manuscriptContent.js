import manuscript from '../../../shared/manuscript.json' with { type: 'json' };
import { createManuscriptProvider } from '../../../shared/manuscript.mjs';
import bookSummaries from '../data/mock/testament/books.js';
import { ApiError } from './api/ApiError.js';

const provider = createManuscriptProvider(manuscript);
const withSummary = book => ({ ...book, description: bookSummaries.find(summary => summary.title.toLowerCase() === book.slug)?.desc ?? '' });
const describedProvider = {
  ...provider,
  getBooks: () => provider.getBooks().map(withSummary),
  getBook: slug => withSummary(provider.getBook(slug)),
  getChapter: (slug, chapter) => { const content = provider.getChapter(slug, chapter); return { ...content, book: withSummary(content.book) }; },
};
export const manuscriptContentProvider = Object.fromEntries(Object.entries(describedProvider).map(([method, read]) => [method, (...args) => {
  try { return read(...args); }
  catch (error) { throw new ApiError(error.message, { code: error.code ?? 'INVALID_RESPONSE', status: error.status ?? 500 }); }
}]));
export const manuscriptCounts = manuscript.counts;
export const manuscriptSource = manuscript.source;

// Quotations used by editorial/home data resolve through the same fixed address
// as the reader and search; a mistyped or empty address fails visibly in checks.
export function manuscriptVerse(book, chapter, verse) {
  const value = manuscriptContentProvider.getVerse(book.toLowerCase(), chapter, verse);
  if (value.status !== 'authored') throw new Error(`Cannot quote missing source text: ${value.canonicalId}`);
  return value.text;
}

export function manuscriptSection(pattern) {
  const section = manuscriptContentProvider.getSections().find(section => section.marker?.includes(pattern));
  if (!section) throw new Error(`Manuscript section not found: ${pattern}`);
  return section.lines.map(line => line.raw);
}
