import { z } from 'zod';
import { apiClient } from './api/client.js';
import { ApiError } from './api/ApiError.js';

const userSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), email: z.string(), displayName: z.string(),
  role: z.string(), emailVerified: z.boolean(), isActive: z.boolean() }).strict();
const profileSchema = z.object({ user: userSchema }).strict();
const loginSchema = profileSchema.extend({ accessToken: z.string().min(1), expiresIn: z.number().int().positive() });
const messageSchema = z.object({ message: z.string() }).strict();
const settingsProfileSchema = z.object({ user: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/),
  displayName: z.string(), email: z.string(), emailVerified: z.boolean(), createdAt: z.string().datetime() }).strict() }).strict();
function decode(schema, envelope) {
  const result = envelope?.success === true && schema.safeParse(envelope.data);
  if (!result?.success) throw new ApiError('The authentication service returned an unexpected response.', { code: 'INVALID_RESPONSE' });
  return result.data;
}

// Access credentials live only in this closure. Refresh credentials are owned
// by the browser's HttpOnly cookie jar; no token is written to browser storage.
export function createAuthService(client = apiClient) {
  let accessToken, expiresAt = 0, epoch = 0;
  const mutation = signal => ({ signal, credentials: 'include', headers: { 'X-CSRF-Protection': '1' } });
  const clear = () => { accessToken = undefined; expiresAt = 0; epoch++; };
  async function profileRequest(method, body, signal) {
    if (!accessToken || expiresAt <= Date.now()) { if (accessToken || expiresAt) clear(); throw new ApiError('Please log in.', { code: 'HTTP_ERROR', status: 401 }); }
    const started = epoch;
    const options = mutation(signal); options.headers.Authorization = `Bearer ${accessToken}`;
    try {
      const response = method === 'get' ? await client.get('/api/users/me', options) : await client.patch('/api/users/me', body, options);
      if (started !== epoch) throw new ApiError('Your session has changed. Please reload.', { status: 401 });
      return decode(settingsProfileSchema, response).user;
    } catch (error) { if (error.status === 401 && started === epoch) clear(); throw error; }
  }
  return {
    getSessionVersion: () => epoch,
    async administrationRequest(method, path, body, { signal, query } = {}) {
      const read = method === 'get' && /^\/api\/admin\/(?:capabilities|overview|audit|users(?:\/[a-f0-9]{24})?)$/.test(path);
      const write = method === 'patch' && /^\/api\/admin\/users\/[a-f0-9]{24}\/status$/.test(path);
      if (!read && !write) throw new ApiError('Invalid administration request.', { code: 'INVALID_INPUT' });
      if (!accessToken || expiresAt <= Date.now()) { if (accessToken || expiresAt) clear(); throw new ApiError('Please log in.', { status: 401 }); }
      const started = epoch, options = { ...mutation(signal), query }; options.headers.Authorization = `Bearer ${accessToken}`;
      try {
        const response = read ? await client.get(path, options) : await client.patch(path, body, options);
        if (started !== epoch) throw new ApiError('Your session has changed. Please reload.', { status: 401 });
        return response;
      } catch (error) { if (error.status === 401 && started === epoch) clear(); throw error; }
    },
    async analyticsRequest(method, path, body, { signal, query } = {}) {
      const ingest = method === 'post' && path === '/api/analytics/events';
      const report = method === 'get' && /^\/api\/analytics\/(?:capabilities|(?:owner|admin)\/(?:overview|trends|pages|content-types|referrals|activity|report))$/.test(path);
      if (!ingest && !report) throw new ApiError('Invalid analytics request.', { code: 'INVALID_INPUT' });
      if (accessToken && expiresAt <= Date.now()) clear();
      if (report && !accessToken) throw new ApiError('Please log in.', { status: 401 });
      const started = epoch, headers = { 'X-CSRF-Protection': '1' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      // Analytics never uses refresh cookies and never invalidates the reading session on failure.
      const options = { signal, query, headers, credentials: 'omit' };
      const response = ingest ? await client.post(path, body, options) : await client.get(path, options);
      if (started !== epoch) throw new ApiError('Your session has changed. Please reload.', { status: 401 });
      return response;
    },
    async communityRequest(method, path, body, { signal, query } = {}) {
      const safe = /^\/api\/(?:discussions(?:\/[a-f0-9]{24}(?:\/comments)?)?|comments\/[a-f0-9]{24}|reading-circles(?:\/[a-f0-9]{24}(?:\/(?:join|leave|members(?:\/[a-f0-9]{24})?))?)?|reports|moderation\/(?:reports(?:\/[a-f0-9]{24})?|actions|audit|capabilities))$/;
      const articlePath = /^\/api\/articles(?:\/(?:mine(?:\/[a-f0-9]{24}(?:\/publications)?)?|moderation(?:\/[a-f0-9]{24}(?:\/publications)?)?|[a-f0-9]{24}(?:\/(?:submit|review))?|[a-z0-9]+(?:-[a-z0-9]+)*))?$/;
      if (!['get', 'post', 'patch', 'delete'].includes(method) || (!safe.test(path) && !(path.length <= 160 && articlePath.test(path)))) throw new ApiError('Invalid community request.', { code: 'INVALID_INPUT' });
      if (accessToken && expiresAt <= Date.now()) clear();
      if (method !== 'get' && !accessToken) throw new ApiError('Please log in.', { status: 401 });
      const started = epoch;
      const options = { ...mutation(signal), query };
      if (accessToken) options.headers.Authorization = `Bearer ${accessToken}`;
      try {
        const response = ['get', 'delete'].includes(method) ? await client[method](path, options) : await client[method](path, body, options);
        if (started !== epoch) throw new ApiError('Your session has changed. Please reload.', { status: 401 });
        return response;
      } catch (error) { if (error.status === 401 && started === epoch) clear(); throw error; }
    },
    // Reuse this session without exporting its bearer token to feature services.
    // Restrict destinations so credentials can never be forwarded elsewhere.
    async privateRequest(method, path, body, { signal, query } = {}) {
      const personalPath = /^\/api\/(?:bookmarks|notes|reading-progress|reading-history)(?:\/[A-Za-z0-9%:-]+)?$/;
      const notificationPath = /^\/api\/notifications(?:\/(?:unread-count|read-all|[a-f0-9]{24}\/read))?$/;
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method) || (!personalPath.test(path) && !notificationPath.test(path)))
        throw new ApiError('Invalid private-resource request.', { code: 'INVALID_INPUT' });
      if (!accessToken || expiresAt <= Date.now()) { if (accessToken || expiresAt) clear(); throw new ApiError('Please log in.', { status: 401 }); }
      const started = epoch;
      const options = { ...mutation(signal), query }; options.headers.Authorization = `Bearer ${accessToken}`;
      try {
        const response = ['get', 'delete'].includes(method) ? await client[method](path, options) : await client[method](path, body, options);
        if (started !== epoch) throw new ApiError('Your session has changed. Please reload.', { status: 401 });
        return response;
      } catch (error) { if (error.status === 401 && started === epoch) clear(); throw error; }
    },
    getProfile({ signal } = {}) { return profileRequest('get', undefined, signal); },
    updateProfile({ displayName }, { signal } = {}) { return profileRequest('patch', { displayName }, signal); },
    async register({ email, password, displayName }, { signal } = {}) {
      return decode(profileSchema, await client.post('/api/auth/register', { email, password, displayName }, mutation(signal))).user;
    },
    async login({ email, password }, { signal } = {}) {
      const started = epoch;
      const data = decode(loginSchema, await client.post('/api/auth/login', { email, password }, mutation(signal)));
      if (started !== epoch) throw new ApiError('Your session has changed. Please try again.', { status: 401 });
      accessToken = data.accessToken; expiresAt = Date.now() + data.expiresIn * 1000;
      epoch++;
      return { user: data.user, expiresIn: data.expiresIn };
    },
    async getCurrentUser({ signal } = {}) {
      if (!accessToken || expiresAt <= Date.now()) {
        if (accessToken || expiresAt) clear();
        throw new ApiError('Please log in.', { code: 'HTTP_ERROR', status: 401 });
      }
      const started = epoch;
      try {
        const response = await client.get('/api/auth/me', { signal, credentials: 'include', headers: { Authorization: `Bearer ${accessToken}` } });
        if (started !== epoch) throw new ApiError('Your session has changed. Please reload.', { status: 401 });
        return decode(profileSchema, response).user;
      } catch (error) { if (error.status === 401 && started === epoch) clear(); throw error; }
    },
    async logout({ signal } = {}) {
      const started = epoch;
      try { await client.post('/api/auth/logout', {}, mutation(signal)); }
      finally { if (started === epoch) clear(); }
    },
    async forgotPassword({ email }, { signal } = {}) {
      return decode(messageSchema, await client.post('/api/auth/forgot-password', { email }, mutation(signal)));
    },
    async resendVerification({ email }, { signal } = {}) {
      return decode(messageSchema, await client.post('/api/auth/resend-verification', { email }, mutation(signal)));
    },
    async verifyEmail({ token }, { signal } = {}) {
      return decode(messageSchema, await client.post('/api/auth/verify-email', { token }, mutation(signal)));
    },
    async resetPassword({ token, newPassword, passwordConfirmation }, { signal } = {}) {
      const started = epoch;
      const result = decode(messageSchema, await client.post('/api/auth/reset-password', { token, newPassword, passwordConfirmation }, mutation(signal)));
      if (started === epoch) clear(); return result;
    },
    async changePassword({ currentPassword, newPassword, passwordConfirmation }, { signal } = {}) {
      if (!accessToken || expiresAt <= Date.now()) { if (accessToken || expiresAt) clear(); throw new ApiError('Please log in.', { code: 'HTTP_ERROR', status: 401 }); }
      const started = epoch;
      try {
        const options = mutation(signal); options.headers.Authorization = `Bearer ${accessToken}`;
        const result = decode(messageSchema, await client.post('/api/auth/change-password', { currentPassword, newPassword, passwordConfirmation }, options));
        if (started === epoch) clear(); return result;
      } catch (error) { if (error.status === 401 && started === epoch) clear(); throw error; }
    },
  };
}
export const authService = createAuthService();
