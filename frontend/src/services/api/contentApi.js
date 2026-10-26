import { apiClient } from './client.js';
import { parseContent, versesSchema } from '../../features/testament/types/contracts.js';
import { ApiError } from './ApiError.js';

function unwrap(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'success' in value) {
    if (value.success !== true || !('data' in value)) throw new ApiError('The content service returned an invalid envelope.', { code: 'INVALID_RESPONSE' });
    return value.data;
  }
  return value;
}
const verse = value => value && typeof value === 'object' ? { ...value, commentary: value.commentary ?? null } : value;
const verses = value => Array.isArray(value) ? value.map(verse) : value;

// This adapter is the only place that knows the proposed REST paths.
// Backend envelopes are unwrapped here; decoded authored strings are never transformed.
export function createContentApi(client = apiClient) {
  const bookPath = (slug) => `/api/books/${encodeURIComponent(slug)}`;
  const chapterPath = (slug, number) => `${bookPath(slug)}/chapters/${number}`;
  return {
    getBooks: async (options) => unwrap(await client.get('/api/books', options)),
    getBook: async (slug, options) => unwrap(await client.get(bookPath(slug), options)),
    getChapters: async (slug, options) => unwrap(await client.get(`${bookPath(slug)}/chapters`, options)),
    getChapter: async (slug, number, options) => {
      const content = unwrap(await client.get(chapterPath(slug, number), options));
      return content && typeof content === 'object' ? { ...content, verses: verses(content.verses) } : content;
    },
    getVerses: async (slug, number, options) => verses(unwrap(await client.get(`${chapterPath(slug, number)}/verses`, options))),
    // Preserve the existing collection lookup; the backend also offers a direct verse route.
    getVerse: async (slug, chapter, number, options) => {
      const content = parseContent(versesSchema, verses(unwrap(await client.get(`${chapterPath(slug, chapter)}/verses`, options))));
      return content.find((verse) => verse.number === number) ?? null;
    },
    search: async (query, options) => unwrap(await client.get('/api/search', { ...options, query: { q: query } })),
    searchPage: async (query, filters, options) => {
      const value = await client.get('/api/search', { ...options, query: { q: query, ...filters } });
      if (value?.success !== true || !Array.isArray(value.data) || !value.pagination)
        throw new ApiError('The search service returned an invalid response.', { code: 'INVALID_RESPONSE' });
      return { items: value.data, pagination: value.pagination };
    },
    getSections: async (kind, options) => unwrap(await client.get('/api/sections', { ...options, query: kind ? { kind } : {} })),
  };
}
