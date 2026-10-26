import { z } from 'zod';
import { authService } from './auth.service.js';
import { ApiError } from './api/ApiError.js';
import { paginationSchema } from './personalLibrary.js';
const id = z.string().regex(/^[a-f0-9]{24}$/);
const types = ['discussion_comment', 'article_approved', 'article_rejected', 'content_moderated', 'circle_invitation', 'circle_membership_changed', 'report_reviewed', 'report_resolved', 'unavailable'];
function safeTarget(value) {
  return value === null || /^\/community\/discussions\/[a-f0-9]{24}$/.test(value) || /^\/articles\/mine\/[a-f0-9]{24}$/.test(value) ||
    /^\/community\/reading-circles\/[a-f0-9]{24}$/.test(value) || value === '/community/reading-circles?scope=invitations';
}
export const notificationSchema = z.object({ id, type: z.enum(types),
  resourceType: z.enum(['discussion', 'comment', 'article', 'circle_membership', 'report']).nullable(), resourceId: id.nullable(),
  message: z.string().max(120), actor: z.object({ id, displayName: z.string().max(80) }).strict().nullable(),
  targetUrl: z.string().nullable().refine(safeTarget), readAt: z.string().datetime().nullable(), createdAt: z.string().datetime(),
}).strict().refine(value => value.type !== 'unavailable' || (value.actor === null && value.targetUrl === null && value.resourceId === null && value.resourceType === null));
const list = z.object({ items: z.array(notificationSchema), pagination: paginationSchema }).strict();
function decode(schema, envelope) {
  const parsed = envelope?.success === true && schema.safeParse(envelope.data);
  if (!parsed?.success) throw new ApiError('The notification service returned an unexpected response.', { code: 'INVALID_RESPONSE' }); return parsed.data;
}
export function createNotificationsService(auth = authService) {
  return {
    list: async (query = {}, options) => decode(list, await auth.privateRequest('get', '/api/notifications', undefined, { ...options, query })),
    unreadCount: async options => decode(z.object({ unreadCount: z.number().int().nonnegative() }).strict(), await auth.privateRequest('get', '/api/notifications/unread-count', undefined, options)).unreadCount,
    read: async (notificationId, options) => {
      if (!id.safeParse(notificationId).success) throw new ApiError('Invalid notification ID.', { code: 'INVALID_INPUT' });
      return decode(z.object({ item: notificationSchema }).strict(), await auth.privateRequest('patch', `/api/notifications/${notificationId}/read`, {}, options)).item;
    },
    readAll: async options => decode(z.object({ markedCount: z.number().int().nonnegative() }).strict(), await auth.privateRequest('post', '/api/notifications/read-all', {}, options)),
  };
}
export const notificationsService = createNotificationsService();
