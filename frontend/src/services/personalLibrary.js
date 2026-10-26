import { z } from 'zod';
import { ApiError } from './api/ApiError.js';
import { verseService } from '../features/testament/services/verseService.js';
export const verseIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*:[1-9][0-9]*:[1-9][0-9]*$/);
export const bookmarkSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), verseId: verseIdSchema, createdAt: z.string().datetime() }).strict();
export const noteSchema = bookmarkSchema.extend({ content: z.string().min(1).max(5000).refine(value => /\S/u.test(value)), updatedAt: z.string().datetime() });
export const paginationSchema = z.object({ page: z.number().int().positive(), limit: z.number().int().positive().max(50),
  total: z.number().int().nonnegative(), pages: z.number().int().nonnegative() }).strict();
export function decode(schema, envelope) {
  const parsed = envelope?.success === true && schema.safeParse(envelope.data);
  if (!parsed?.success) throw new ApiError('The private library returned an unexpected response.', { code: 'INVALID_RESPONSE' });
  return parsed.data;
}
export const itemSchema = schema => z.object({ item: schema }).strict();
export const listSchema = schema => z.object({ items: z.array(schema), pagination: paginationSchema }).strict();
export function noteContentError(content) {
  return typeof content !== 'string' || !/\S/u.test(content) ? 'Write a note before saving.' :
    content.length > 5000 ? 'Use no more than 5,000 characters.' : '';
}
export function verseLink(verseId) {
  verseIdSchema.parse(verseId);
  const [book, chapter, verse] = verseId.split(':');
  return `/testament/${book}/${chapter}/${verse}`;
}
// Private records never carry copied manuscript text. Resolve each distinct
// reference through the same service as the reader, retaining unavailable state.
export async function resolveLibraryVerses(items, options, service = verseService) {
  const resolved = new Map();
  await Promise.all([...new Set(items.map(item => item.verseId))].map(async id => {
    verseIdSchema.parse(id);
    const [book, chapter, number] = id.split(':');
    try { resolved.set(id, { verse: await service.getVerse(book, Number(chapter), Number(number), options) }); }
    catch (error) { if (options?.signal?.aborted) throw error; resolved.set(id, { verseError: 'The manuscript passage could not be loaded. Open the verse to retry.' }); }
  }));
  return items.map(item => ({ ...item, ...resolved.get(item.verseId) }));
}
