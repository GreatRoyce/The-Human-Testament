import { z } from 'zod';
import { authService } from './auth.service.js';
import { decode, paginationSchema } from './personalLibrary.js';
export const bookIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const readingLocationSchema = z.object({ bookId: bookIdSchema, chapterNumber: z.number().int().positive(),
  verseNumber: z.number().int().positive().optional() });
const progressSchema = readingLocationSchema.extend({ revision: z.number().int().positive(), lastReadAt: z.string().datetime(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime() }).strict();
const historySchema = readingLocationSchema.extend({ id: z.string().regex(/^[a-f0-9]{24}$/), visitedAt: z.string().datetime(), createdAt: z.string().datetime() }).strict();
const progressResponse = z.object({ item: progressSchema }).strict();
const savedResponse = progressResponse.extend({ replayed: z.boolean() });
const pathFor = bookId => `/api/reading-progress/${encodeURIComponent(bookIdSchema.parse(bookId))}`;
export function readingLocationUrl(location) {
  const { bookId, chapterNumber, verseNumber } = readingLocationSchema.parse(location);
  return `/testament/${bookId}/${chapterNumber}${verseNumber === undefined ? '' : `/${verseNumber}`}`;
}
export function readingLocationLabel(location) {
  const book = location.bookId.replace(/-/g, ' ');
  return `${book[0].toUpperCase()}${book.slice(1)} ${location.chapterNumber}${location.verseNumber === undefined ? '' : `:${location.verseNumber}`}`;
}
export const sameReadingLocation = (left, right) => Boolean(left && right && left.bookId === right.bookId &&
  left.chapterNumber === right.chapterNumber && left.verseNumber === right.verseNumber);
export function createReadingService(auth = authService) {
  return {
    sessionVersion: () => auth.getSessionVersion(),
    async list(options) { return decode(z.object({ items: z.array(progressSchema) }).strict(), await auth.privateRequest('get', '/api/reading-progress', undefined, options)).items; },
    async get(bookId, options) {
      try { return decode(progressResponse, await auth.privateRequest('get', pathFor(bookId), undefined, options)).item; }
      catch (error) { if (error.status === 404) return null; throw error; }
    },
    async save(bookId, { chapterNumber, verseNumber, expectedRevision, eventId }, options) {
      return decode(savedResponse, await auth.privateRequest('put', pathFor(bookId),
        { chapterNumber, ...(verseNumber === undefined ? {} : { verseNumber }), expectedRevision, eventId }, options));
    },
    async history(query = {}, options) {
      return decode(z.object({ items: z.array(historySchema), pagination: paginationSchema }).strict(),
        await auth.privateRequest('get', '/api/reading-history', undefined, { ...options, query }));
    },
  };
}
export const readingService = createReadingService();
