import { authService } from './auth.service.js';
import { bookmarkSchema, decode, itemSchema, listSchema, verseIdSchema } from './personalLibrary.js';
export function createBookmarksService(auth = authService) {
  return {
    async list(query = {}, options) { return decode(listSchema(bookmarkSchema), await auth.privateRequest('get', '/api/bookmarks', undefined, { ...options, query })); },
    async save(verseId, options) { verseIdSchema.parse(verseId); return decode(itemSchema(bookmarkSchema), await auth.privateRequest('post', '/api/bookmarks', { verseId }, options)).item; },
    async remove(verseId, options) { verseIdSchema.parse(verseId); return decode(itemSchema(bookmarkSchema), await auth.privateRequest('delete', `/api/bookmarks/${encodeURIComponent(verseId)}`, undefined, options)).item; },
  };
}
export const bookmarksService = createBookmarksService();
