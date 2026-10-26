import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../src/services/auth.service.js';
import { createApiClient } from '../src/services/api/client.js';
import { validateProductionEnv } from '../config/production-env.mjs';
const user = { id: 'a'.repeat(24), email: 'synthetic@example.test', displayName: 'Reader', role: 'user', emailVerified: true, isActive: true };
const login = () => ({ success: true, data: { user, accessToken: 'synthetic-token', expiresIn: 900 } });
const profile = () => ({ success: true, data: { user: { id: user.id, email: user.email, displayName: user.displayName, emailVerified: true, createdAt: '2026-10-26T00:00:00.000Z' } } });
test('late profile reads and profile 401s cannot expose the previous account or clear a newer session', async () => {
  let resolvePending, rejectPending;
  const auth = createAuthService({ post: async () => login(), get: async () => new Promise((resolve, reject) => { resolvePending = resolve; rejectPending = reject; }) });
  await auth.login({}); let pending = auth.getProfile(); await auth.logout(); await auth.login({});
  resolvePending(profile()); await assert.rejects(pending, { status: 401 });
  pending = auth.getProfile(); await auth.logout(); await auth.login({}); const epoch = auth.getSessionVersion();
  rejectPending(Object.assign(new Error('Old session'), { status: 401 })); await assert.rejects(pending, { status: 401 }); assert.equal(auth.getSessionVersion(), epoch);
});

test('old login replies cannot replace a newer authenticated session', async () => {
  let resolveOld, count = 0;
  const auth = createAuthService({ post: async () => ++count === 1 ? new Promise(resolve => { resolveOld = resolve; }) : login() });
  const pending = auth.login({}); await auth.login({}); const epoch = auth.getSessionVersion();
  resolveOld(login()); await assert.rejects(pending, { status: 401 }); assert.equal(auth.getSessionVersion(), epoch);
});

test('production builds reject secret-prefixed variables and unsafe API endpoints', async () => {
  assert.doesNotThrow(() => validateProductionEnv({ VITE_CONTENT_SOURCE: 'pdf' }));
  assert.doesNotThrow(() => validateProductionEnv({ VITE_CONTENT_SOURCE: 'api', VITE_API_URL: 'https://api.example.test/prefix' }));
  for (const env of [
    { VITE_CONTENT_SOURCE: 'mock' }, { VITE_CONTENT_SOURCE: 'api' }, { VITE_ANALYTICS_ENABLED: 'true' },
    { VITE_AUTH_ACCESS_TOKEN_SECRET: 'synthetic-value' }, { VITE_API_URL: 'http://localhost:5000' },
    { VITE_API_URL: 'https://user:password@api.example.test' }, { VITE_API_URL: 'https://api.example.test?token=synthetic' },
    { VITE_API_URL: 'https://api.example.test/api' },
  ]) assert.throws(() => validateProductionEnv(env));
  let fetched = false;
  for (const baseUrl of ['https://user:password@api.example.test', 'https://api.example.test?token=synthetic', 'https://api.example.test/api', 'https://api.example.test#fragment']) {
    const client = createApiClient({ baseUrl, fetchImpl: async () => { fetched = true; } });
    await assert.rejects(client.get('/api/auth/me'), { code: 'CONFIGURATION_ERROR' });
  }
  assert.equal(fetched, false);
});
test('late logout and password-operation replies cannot erase a newer login', async () => {
  for (const operation of ['logout', 'resetPassword', 'changePassword']) {
    let resolvePending;
    const auth = createAuthService({ post: async path => path.endsWith('/login') ? login() : new Promise(resolve => { resolvePending = resolve; }) });
    await auth.login({}); const pending = auth[operation]({}); await auth.login({}); const epoch = auth.getSessionVersion();
    resolvePending({ success: true, data: { message: 'Completed.' } }); await pending; assert.equal(auth.getSessionVersion(), epoch, operation);
  }
});

test('slow API requests time out and caller cancellation remains distinguishable', async () => {
  const fetchImpl = async (_url, { signal }) => new Promise((_, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl, timeoutMs: 30 });
  await assert.rejects(client.get('/api/books'), { code: 'TIMEOUT' });
  const controller = new AbortController();
  const pending = client.get('/api/books', { signal: controller.signal }); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  const stalledBody = createApiClient({ baseUrl: 'https://api.example.test', timeoutMs: 30,
    fetchImpl: async (_url, { signal }) => ({ ok: true, json: async () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) }) });
  await assert.rejects(stalledBody.get('/api/books'), { code: 'TIMEOUT' });
});
