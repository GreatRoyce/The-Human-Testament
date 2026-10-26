import { authService } from './auth.service.js';
import { decode, itemSchema, listSchema, noteSchema, verseIdSchema } from './personalLibrary.js';
import { ApiError } from './api/ApiError.js';
const notePath = id => {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) throw new ApiError('Invalid note address.', { code: 'INVALID_INPUT' });
  return `/api/notes/${id}`;
};
export function createNotesService(auth = authService) {
  const item = async (method, path, body, options) => decode(itemSchema(noteSchema), await auth.privateRequest(method, path, body, options)).item;
  return {
    async list(query = {}, options) { return decode(listSchema(noteSchema), await auth.privateRequest('get', '/api/notes', undefined, { ...options, query })); },
    create({ verseId, content }, options) { verseIdSchema.parse(verseId); return item('post', '/api/notes', { verseId, content }, options); },
    get(id, options) { return item('get', notePath(id), undefined, options); },
    update(id, { content }, options) { return item('patch', notePath(id), { content }, options); },
    remove(id, options) { return item('delete', notePath(id), undefined, options); },
  };
}
export const notesService = createNotesService();
