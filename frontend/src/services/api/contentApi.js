import { apiClient } from './client.js';
import { parseContent, versesSchema } from '../../features/testament/types/contracts.js';

// This adapter is the only place that knows the proposed REST paths.
// If the backend chooses response envelopes, unwrap them here.
export function createContentApi(client = apiClient) {
  const bookPath = (slug) => `/api/books/${encodeURIComponent(slug)}`;
  const chapterPath = (slug, number) => `${bookPath(slug)}/chapters/${number}`;
  return {
    getBooks: (options) => client.get('/api/books', options),
    getBook: (slug, options) => client.get(bookPath(slug), options),
    getChapters: (slug, options) => client.get(`${bookPath(slug)}/chapters`, options),
    getChapter: (slug, number, options) => client.get(chapterPath(slug, number), options),
    getVerses: (slug, number, options) => client.get(`${chapterPath(slug, number)}/verses`, options),
    // No separate single-verse endpoint has been promised.
    getVerse: async (slug, chapter, number, options) => {
      const verses = parseContent(versesSchema, await client.get(`${chapterPath(slug, chapter)}/verses`, options));
      return verses.find((verse) => verse.number === number) ?? null;
    },
    search: (query, options) => client.get('/api/search', { ...options, query: { q: query } }),
  };
}
