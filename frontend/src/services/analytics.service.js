import { z } from 'zod';
import { authService } from './auth.service.js';
import { ApiError } from './api/ApiError.js';
const metric = z.object({ current: z.number().int().nonnegative(), previous: z.number().int().nonnegative(), changePercent: z.number().nullable() }).strict();
const row = z.object({ label: z.string().max(253), pageViews: z.number().int().nonnegative() }).strict();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  range: z.object({ start: date, end: date, interval: z.enum(['day', 'week', 'month']), timezone: z.literal('UTC') }).strict(),
  metrics: z.object({ visits: metric, estimatedVisitors: metric, pageViews: metric }).strict(),
  pages: z.array(row).max(50), contentTypes: z.array(row).max(50), referrals: z.array(row).max(50),
  activity: z.array(z.object({ authenticated: z.boolean(), pageViews: z.number().int().nonnegative() }).strict()).max(2),
  trends: z.array(z.object({ date, visits: z.number().int().nonnegative(), estimatedVisitors: z.number().int().nonnegative(), pageViews: z.number().int().nonnegative() }).strict()).max(90),
  coverage: z.object({ availableFrom: z.string().datetime(), through: z.string().datetime(), partial: z.boolean(), previousPartial: z.boolean(), empty: z.boolean(), retentionDays: z.number().int().min(7).max(365) }).strict(),
  operations: z.object({ collectionEnabled: z.boolean(), storageReady: z.boolean(), retentionDays: z.number().int() }).strict().optional(),
}).strict();
export const analyticsOverviewSchema = schema.pick({ range: true, metrics: true, pages: true, coverage: true });
export function createAnalyticsService(auth = authService) {
  return {
    async report(scope, query = {}, options = {}) {
      if (!['owner', 'admin'].includes(scope)) throw new ApiError('Invalid analytics permission.', { code: 'INVALID_INPUT' });
      const response = await auth.analyticsRequest('get', `/api/analytics/${scope}/report`, undefined, { ...options, query });
      const parsed = response?.success === true && schema.safeParse(response.data);
      if (!parsed?.success) throw new ApiError('Analytics returned an unexpected response.', { code: 'INVALID_RESPONSE' });
      return parsed.data;
    },
    async capabilities(options = {}) {
      const response = await auth.analyticsRequest('get', '/api/analytics/capabilities', undefined, options);
      const parsed = response?.success === true && z.object({ owner: z.boolean(), admin: z.boolean() }).strict().safeParse(response.data);
      if (!parsed?.success) throw new ApiError('Analytics returned an unexpected response.', { code: 'INVALID_RESPONSE' });
      return parsed.data;
    },
  };
}
export const analyticsService = createAnalyticsService();
