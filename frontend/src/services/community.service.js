import { z } from 'zod';
import { authService } from './auth.service.js';
import { ApiError } from './api/ApiError.js';
import { paginationSchema, verseIdSchema } from './personalLibrary.js';
const idSchema = z.string().regex(/^[a-f0-9]{24}$/);
const author = z.object({ id: idSchema, displayName: z.string() }).strict();
const dates = { createdAt: z.string().datetime(), updatedAt: z.string().datetime() };
export const discussionSchema = z.object({ id: idSchema, author, title: z.string().max(160), body: z.string().max(10000),
  bookId: z.string().optional(), chapterNumber: z.number().int().positive().optional(), verseId: verseIdSchema.optional(), circleId: idSchema.optional(),
  visibility: z.enum(['public', 'circle']), status: z.enum(['active', 'locked']), ...dates, commentCount: z.number().int().nonnegative(), canEdit: z.boolean(),
  canDelete: z.boolean(), canModerate: z.boolean().optional(), canComment: z.boolean().optional() }).strict();
export const commentSchema = z.object({ id: idSchema, discussionId: idSchema, author, body: z.string().max(5000),
  status: z.literal('active'), ...dates, canEdit: z.boolean() }).strict();
export const circleSchema = z.object({ id: idSchema, name: z.string().max(100), description: z.string().max(2000), owner: author,
  visibility: z.enum(['public', 'private']), membershipPolicy: z.enum(['open', 'invitation']), status: z.enum(['active', 'archived']),
  membership: z.object({ role: z.enum(['owner', 'moderator', 'member']), status: z.enum(['active', 'pending', 'removed']) }).strict().nullable(), canManage: z.boolean(), ...dates }).strict();
const member = z.object({ user: author, role: z.enum(['owner', 'moderator', 'member']), status: z.enum(['active', 'pending']), joinedAt: z.string().datetime().nullable() }).strict();
const report = z.object({ id: idSchema, targetType: z.enum(['discussion', 'comment', 'article']), targetId: idSchema, reason: z.string(), details: z.string(), status: z.enum(['open', 'reviewed', 'resolved']), createdAt: z.string().datetime(),
  context: z.union([z.object({ discussionId: idSchema, title: z.string().optional(), body: z.string(), status: z.enum(['active', 'locked', 'hidden', 'deleted']) }).strict(),
    z.object({ articleId: idSchema, articleSlug: z.string(), title: z.string(), body: z.string(), status: z.enum(['draft', 'pending_review', 'published', 'rejected', 'archived']), revision: z.number().int().nonnegative() }).strict()]).nullable() }).strict();
const audit = z.object({ id: idSchema, moderatorId: idSchema, action: z.string(), reason: z.string(), previousStatus: z.string(), resultingStatus: z.string(), createdAt: z.string().datetime() }).strict();
const message = z.object({ message: z.string() }).strict();
const item = schema => z.object({ item: schema }).strict();
const list = schema => z.object({ items: z.array(schema), pagination: paginationSchema }).strict();
function decode(schema, envelope) {
  const parsed = envelope?.success === true && schema.safeParse(envelope.data);
  if (!parsed?.success) throw new ApiError('The community service returned an unexpected response.', { code: 'INVALID_RESPONSE' });
  return parsed.data;
}
function address(value) { if (!idSchema.safeParse(value).success) throw new ApiError('Invalid community address.', { code: 'INVALID_INPUT' }); return value; }
const pick = (input, keys) => Object.fromEntries(keys.filter(key => input[key] !== undefined).map(key => [key, input[key]]));
export function createCommunityService(auth = authService) {
  const request = async (method, path, body, schema, options) => decode(schema, await auth.communityRequest(method, path, body, options));
  const getItem = async (path, schema, options) => (await request('get', path, undefined, item(schema), options)).item;
  return {
    discussions: (query = {}, options) => request('get', '/api/discussions', undefined, list(discussionSchema), { ...options, query }),
    discussion: (id, options) => getItem('/api/discussions/' + address(id), discussionSchema, options),
    createDiscussion: async (input, options) => (await request('post', '/api/discussions', pick(input, ['title', 'body', 'bookId', 'chapterNumber', 'verseId', 'circleId']), item(discussionSchema), options)).item,
    updateDiscussion: async (id, input, options) => (await request('patch', '/api/discussions/' + address(id), pick(input, ['title', 'body']), item(discussionSchema), options)).item,
    deleteDiscussion: (id, options) => request('delete', '/api/discussions/' + address(id), {}, message, options),
    comments: (id, query = {}, options) => request('get', `/api/discussions/${address(id)}/comments`, undefined, list(commentSchema), { ...options, query }),
    createComment: async (id, input, options) => (await request('post', `/api/discussions/${address(id)}/comments`, pick(input, ['body']), item(commentSchema), options)).item,
    updateComment: async (id, input, options) => (await request('patch', '/api/comments/' + address(id), pick(input, ['body']), item(commentSchema), options)).item,
    deleteComment: (id, options) => request('delete', '/api/comments/' + address(id), {}, message, options),
    circles: (query = {}, options) => request('get', '/api/reading-circles', undefined, list(circleSchema), { ...options, query }),
    circle: (id, options) => getItem('/api/reading-circles/' + address(id), circleSchema, options),
    createCircle: async (input, options) => (await request('post', '/api/reading-circles', pick(input, ['name', 'description', 'visibility', 'membershipPolicy']), item(circleSchema), options)).item,
    updateCircle: async (id, input, options) => (await request('patch', '/api/reading-circles/' + address(id), pick(input, ['name', 'description', 'status']), item(circleSchema), options)).item,
    join: (id, options) => request('post', `/api/reading-circles/${address(id)}/join`, {}, message, options),
    leave: (id, options) => request('post', `/api/reading-circles/${address(id)}/leave`, {}, message, options),
    members: (id, query = {}, options) => request('get', `/api/reading-circles/${address(id)}/members`, undefined, list(member), { ...options, query }),
    manageMember: (id, userId, action, options) => request('patch', `/api/reading-circles/${address(id)}/members/${address(userId)}`, { action }, message, options),
    report: (input, options) => request('post', '/api/reports', pick(input, ['targetType', 'targetId', 'reason', 'details']), z.object({ id: idSchema, status: z.enum(['open', 'reviewed', 'resolved']) }).strict(), options),
    capabilities: options => request('get', '/api/moderation/capabilities', undefined, z.object({ globalModerator: z.boolean() }).strict(), options),
    reports: (query = {}, options) => request('get', '/api/moderation/reports', undefined, list(report), { ...options, query }),
    review: (id, status, reason, options) => request('patch', '/api/moderation/reports/' + address(id), { status, reason }, message, options),
    moderate: (input, options) => request('post', '/api/moderation/actions', pick(input, ['targetType', 'targetId', 'action', 'reason']), message, options),
    audit: (query, options) => request('get', '/api/moderation/audit', undefined, list(audit), { ...options, query }),
  };
}
export const communityService = createCommunityService();
