import { z } from 'zod';
import { authService } from './auth.service.js';
import { ApiError } from './api/ApiError.js';
import { paginationSchema, verseIdSchema } from './personalLibrary.js';
const id = z.string().regex(/^[a-f0-9]{24}$/);
export const articleCategories = ['essay', 'reflection', 'analysis', 'reading-guide'];
export const articleStatuses = ['draft', 'pending_review', 'published', 'rejected', 'archived'];
export const articleReferenceSchema = z.object({ bookId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), chapterNumber: z.number().int().positive().optional(), verseId: verseIdSchema.optional() }).strict();
const cover = z.string().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !/\s/u.test(value) && [...value].every(character => character.codePointAt(0) > 31 && character.codePointAt(0) !== 127) && /\.(?:png|jpe?g|webp|avif)$/i.test(url.pathname); } catch { return false; }
});
const contentShape = { title: z.string().min(1).max(180), subtitle: z.string().max(300), body: z.string().min(1).max(100000), excerpt: z.string().max(600),
  coverImage: cover, tags: z.array(z.string().max(32).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(8), category: z.enum(['', ...articleCategories]), canonicalReferences: z.array(articleReferenceSchema).max(12) };
export const articleSummarySchema = z.object({ id, author: z.object({ id, displayName: z.string() }).strict(), title: contentShape.title, subtitle: contentShape.subtitle,
  slug: z.string().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), excerpt: contentShape.excerpt, coverImage: cover, tags: contentShape.tags, category: contentShape.category,
  status: z.enum(articleStatuses), revision: z.number().int().nonnegative(), publishedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() }).strict();
export const articleSchema = articleSummarySchema.extend({ body: contentShape.body, canonicalReferences: contentShape.canonicalReferences });
const ownedSchema = articleSchema.extend({ reviewReason: z.string().max(1000) });
const publicationSchema = z.object({ id, revision: z.number().int().positive(), slug: z.string(), publishedAt: z.string().datetime(), approvedBy: id, reason: z.string(), content: z.object(contentShape).strict() }).strict();
const list = schema => z.object({ items: z.array(schema), pagination: paginationSchema }).strict();
const item = schema => z.object({ item: schema }).strict();
const keys = Object.keys(contentShape);
const pick = (input, fields) => Object.fromEntries(fields.filter(key => input[key] !== undefined).map(key => [key, input[key]]));
function address(value) { if (!id.safeParse(value).success) throw new ApiError('Invalid article ID.', { code: 'INVALID_INPUT' }); return value; }
export function createArticlesService(auth = authService) {
  async function request(method, path, body, schema, options) {
    const envelope = await auth.communityRequest(method, path, body, options), parsed = envelope?.success === true && schema.safeParse(envelope.data);
    if (!parsed?.success) throw new ApiError('The article service returned an unexpected response.', { code: 'INVALID_RESPONSE' }); return parsed.data;
  }
  return {
    list: (query = {}, options) => request('get', '/api/articles', undefined, list(articleSummarySchema.extend({ status: z.literal('published') })), { ...options, query }),
    get: async (slug, options) => {
      if (typeof slug !== 'string' || slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ApiError('Invalid article address.', { code: 'INVALID_INPUT' });
      return (await request('get', '/api/articles/' + slug, undefined, item(articleSchema.extend({ status: z.literal('published') })), options)).item;
    },
    mine: (query = {}, options) => request('get', '/api/articles/mine', undefined, list(articleSummarySchema), { ...options, query }),
    own: async (id, options) => (await request('get', '/api/articles/mine/' + address(id), undefined, item(ownedSchema), options)).item,
    create: async (input, options) => (await request('post', '/api/articles', pick(input, keys), item(ownedSchema), options)).item,
    update: async (id, input, options) => (await request('patch', '/api/articles/' + address(id), pick(input, [...keys, 'expectedRevision']), item(ownedSchema), options)).item,
    archive: (id, options) => request('delete', '/api/articles/' + address(id), {}, z.object({ message: z.string(), id: z.string() }).strict(), options),
    submit: async (id, expectedRevision, options) => (await request('post', `/api/articles/${address(id)}/submit`, { expectedRevision }, item(ownedSchema), options)).item,
    queue: (query = {}, options) => request('get', '/api/articles/moderation', undefined, list(articleSummarySchema), { ...options, query }),
    reviewArticle: async (id, options) => (await request('get', '/api/articles/moderation/' + address(id), undefined, item(ownedSchema), options)).item,
    review: async (id, input, options) => (await request('post', `/api/articles/${address(id)}/review`, pick(input, ['action', 'reason', 'expectedRevision']), item(ownedSchema), options)).item,
    publications: (id, moderator, query = {}, options) => request('get', `/api/articles/${moderator ? 'moderation' : 'mine'}/${address(id)}/publications`, undefined, list(publicationSchema), { ...options, query }),
  };
}
export const articlesService = createArticlesService();
