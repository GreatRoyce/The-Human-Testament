import { z } from 'zod';
import { authService } from './auth.service.js';
import { ApiError } from './api/ApiError.js';
import { paginationSchema } from './personalLibrary.js';
import { analyticsOverviewSchema } from './analytics.service.js';
const id = z.string().regex(/^[a-f0-9]{24}$/), count = z.number().int().nonnegative();
export const adminUserSchema = z.object({ id, displayName: z.string().min(1).max(80), email: z.string().max(254), role: z.literal('user'),
  isActive: z.boolean(), emailVerified: z.boolean(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  permissions: z.object({ administration: z.boolean(), analyticsOwner: z.boolean(), analyticsAdmin: z.boolean(), globalModerator: z.boolean() }).strict() }).strict();
export const adminAuditSchema = z.object({ id, moderatorId: id, targetId: id, targetType: z.enum(['user', 'admin_permission', 'article', 'discussion', 'comment', 'report']),
  action: z.enum(['activate', 'deactivate', 'grant_admin', 'revoke_admin', 'hide', 'restore', 'lock', 'unlock', 'delete', 'review', 'resolve', 'approve', 'reject', 'unpublish', 'archive']),
  reason: z.string().max(1000), previousStatus: z.string(), resultingStatus: z.string(), createdAt: z.string().datetime(),
  source: z.enum(['moderation', 'administration', 'operator']), operatorLabel: z.string().max(100) }).strict();
const optional = schema => z.union([z.object({ available: z.literal(true), data: schema }).strict(), z.object({ available: z.literal(false), message: z.string() }).strict()]);
const overviewSchema = z.object({ users: z.object({ total: count, active: count, deactivated: count, recent: count, recentDays: z.literal(7) }).strict(),
  articles: optional(z.object({ pending: count }).strict()), reports: optional(z.object({ outstanding: count }).strict()), analytics: optional(analyticsOverviewSchema),
  recentActions: z.array(adminAuditSchema).max(5), communityQueue: z.object({ available: z.literal(false), message: z.string() }).strict(),
  health: z.object({ authentication: z.literal('ready'), administration: z.literal('ready'), timestamp: z.string().datetime() }).strict() }).strict();
const capabilitiesSchema = z.object({ administration: z.literal(true), globalModerator: z.boolean(), roleManagement: z.literal(false), analyticsConfigured: z.boolean() }).strict();
const list = schema => z.object({ items: z.array(schema).max(50), pagination: paginationSchema }).strict();
const address = value => { if (!id.safeParse(value).success) throw new ApiError('Invalid account address.', { code: 'INVALID_INPUT' }); return value; };
const compact = query => Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '' && value !== undefined));
export function createAdministrationService(auth = authService) {
  async function request(method, path, body, schema, options) {
    const envelope = await auth.administrationRequest(method, path, body, options), result = envelope?.success === true && schema.safeParse(envelope.data);
    if (!result?.success) throw new ApiError('Administration returned an unexpected response.', { code: 'INVALID_RESPONSE' }); return result.data;
  }
  return {
    capabilities: options => request('get', '/api/admin/capabilities', undefined, capabilitiesSchema, options),
    overview: options => request('get', '/api/admin/overview', undefined, overviewSchema, options),
    users: (query = {}, options) => request('get', '/api/admin/users', undefined, list(adminUserSchema), { ...options, query: compact(query) }),
    user: async (id, options) => (await request('get', '/api/admin/users/' + address(id), undefined, z.object({ item: adminUserSchema }).strict(), options)).item,
    audit: (query = {}, options) => request('get', '/api/admin/audit', undefined, list(adminAuditSchema), { ...options, query: compact(query) }),
    setStatus: (id, { isActive, expectedIsActive, reason }, options) => request('patch', `/api/admin/users/${address(id)}/status`, { isActive, expectedIsActive, reason },
      z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), isActive: z.boolean(), message: z.string() }).strict(), options),
  };
}
export const administrationService = createAdministrationService();
