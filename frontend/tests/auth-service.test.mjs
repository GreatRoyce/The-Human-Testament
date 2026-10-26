import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/services/api/client.js';
import { createAuthService } from '../src/services/auth.service.js';
const user = { id: '123456789012345678901234', email: 'reader@example.test', displayName: 'Reader', role: 'user', emailVerified: false, isActive: true };

test('authentication uses the shared API transport and keeps access credentials internal and temporary', async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    const data = url.pathname.endsWith('/login') ? { user, accessToken: 'synthetic-access-token', expiresIn: 900 } :
      url.pathname.endsWith('/logout') ? { message: 'Logged out.' } : { user };
    return new Response(JSON.stringify({ success: true, data }));
  } });
  const auth = createAuthService(client);
  await assert.rejects(auth.getCurrentUser(), { status: 401 });
  assert.deepEqual(await auth.register({ email: user.email, displayName: user.displayName, password: 'synthetic password' }), user);
  const login = await auth.login({ email: user.email, password: 'synthetic password' });
  assert.deepEqual(login, { user, expiresIn: 900 }); assert.equal(login.accessToken, undefined);
  assert.deepEqual(await auth.getCurrentUser(), user);
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer synthetic-access-token');
  await auth.logout();
  await assert.rejects(auth.getCurrentUser(), { status: 401 });
  assert.deepEqual(calls.map(call => call.url.pathname), ['/api/auth/register', '/api/auth/login', '/api/auth/me', '/api/auth/logout']);
  for (const { init } of calls) {
    assert.equal(init.credentials, 'include');
    if (init.method === 'POST') { assert.equal(init.headers['Content-Type'], 'application/json'); assert.equal(init.headers['X-CSRF-Protection'], '1'); }
  }
  await assert.rejects(createAuthService(client).getCurrentUser(), { status: 401 });
});

test('authentication errors remain safe and malformed profiles/credential leaks are rejected', async () => {
  const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async () =>
    new Response(JSON.stringify({ success: false, message: 'Invalid email or password.' }), { status: 401 }) });
  await assert.rejects(createAuthService(client).login({ email: user.email, password: 'incorrect' }),
    error => error.status === 401 && error.message === 'Invalid email or password.');
  for (const data of [{ user: { ...user, passwordHash: 'must not be exposed' } }, { user, refreshToken: 'must not be exposed' }, { user: null }]) {
    const auth = createAuthService({ post: async () => ({ success: true, data }) });
    await assert.rejects(auth.register({ email: user.email, password: 'synthetic', displayName: user.displayName }), { code: 'INVALID_RESPONSE' });
  }
});

test('logout clears in-memory access even if the server cannot be reached and reports the failure', async () => {
  const auth = createAuthService({ post: async path => {
    if (path.endsWith('/logout')) throw new Error('network failure');
    return { success: true, data: { user, accessToken: 'synthetic', expiresIn: 900 } };
  } });
  await auth.login({ email: user.email, password: 'synthetic' });
  await assert.rejects(auth.logout(), /network failure/);
  await assert.rejects(auth.getCurrentUser(), { status: 401 });
});

test('unauthorized profile reads clear the in-memory access token', async () => {
  let reads = 0;
  const auth = createAuthService({ post: async () => ({ success: true, data: { user, accessToken: 'synthetic', expiresIn: 900 } }),
    get: async () => { reads++; throw Object.assign(new Error('unauthorized'), { status: 401 }); } });
  await auth.login({ email: user.email, password: 'synthetic' });
  await assert.rejects(auth.getCurrentUser(), { status: 401 });
  await assert.rejects(auth.getCurrentUser(), { status: 401 });
  assert.equal(reads, 1);
});
