import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '../src/services/api/client.js';
import { createAuthService } from '../src/services/auth.service.js';
import { displayNameError } from '../src/features/account/profileValidation.js';
const profile = { id: '123456789012345678901234', displayName: 'Synthetic Reader', email: 'reader@example.test',
  emailVerified: false, createdAt: '2026-10-22T10:00:00.000Z' };
const loginUser = { id: profile.id, displayName: profile.displayName, email: profile.email, emailVerified: false, role: 'user', isActive: true };

test('profile requests reuse auth credentials and shared GET/PATCH transport with exact payloads', async () => {
  const calls = []; let stored = profile;
  const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.pathname === '/api/auth/login') return Response.json({ success: true, data: { user: loginUser, accessToken: 'synthetic-access', expiresIn: 900 } });
    if (init.method === 'PATCH') stored = { ...profile, displayName: JSON.parse(init.body).displayName.trim() };
    return Response.json({ success: true, data: { user: stored } });
  } });
  const auth = createAuthService(client), signal = new AbortController().signal;
  await assert.rejects(auth.getProfile(), { status: 401 });
  await assert.rejects(auth.updateProfile({ displayName: 'Denied' }), { status: 401 }); assert.equal(calls.length, 0);
  await auth.login({ email: profile.email, password: 'Synthetic passphrase!' });
  assert.deepEqual(await auth.getProfile({ signal }), profile);
  const updated = await auth.updateProfile({ displayName: '  New Reader  ', role: 'admin', email: 'must-not-forward@example.test', userId: 'other' }, { signal });
  assert.equal(updated.displayName, 'New Reader'); assert.equal(updated.email, profile.email);
  assert.deepEqual(calls.map(call => [call.url.pathname, call.init.method]), [['/api/auth/login', 'POST'], ['/api/users/me', 'GET'], ['/api/users/me', 'PATCH']]);
  assert.deepEqual(JSON.parse(calls[2].init.body), { displayName: '  New Reader  ' });
  for (const index of [1, 2]) {
    assert.equal(calls[index].init.credentials, 'include'); assert.equal(calls[index].init.headers.Authorization, 'Bearer synthetic-access');
    assert.equal(calls[index].init.signal, signal); assert.equal(calls[index].url.search, '');
  }
  assert.equal(calls[2].init.headers['Content-Type'], 'application/json'); assert.equal(calls[2].init.headers['X-CSRF-Protection'], '1');
  assert.equal(updated.accessToken, undefined);
});

test('profile validation failures preserve the session; 401 and failed logout clear local profile access', async () => {
  let mode = 'validation', getCalls = 0;
  const auth = createAuthService(createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url, init) => {
    if (url.pathname.endsWith('/login')) return Response.json({ success: true, data: { user: loginUser, accessToken: 'synthetic', expiresIn: 900 } });
    if (url.pathname.endsWith('/logout')) throw new Error('Synthetic network failure');
    if (init.method === 'PATCH') return Response.json({ success: false, message: mode === 'validation' ? 'Display name is invalid.' : 'Authentication required.' }, { status: mode === 'validation' ? 400 : 401 });
    getCalls++; return Response.json({ success: true, data: { user: profile } });
  } }));
  await auth.login({ email: profile.email, password: 'Synthetic' });
  await assert.rejects(auth.updateProfile({ displayName: 'bad' }), error => error.status === 400 && error.message === 'Display name is invalid.');
  assert.deepEqual(await auth.getProfile(), profile);
  mode = 'unauthorized'; await assert.rejects(auth.updateProfile({ displayName: 'Denied' }), { status: 401 });
  await assert.rejects(auth.getProfile(), { status: 401 }); assert.equal(getCalls, 1);
  await auth.login({ email: profile.email, password: 'Synthetic' });
  await assert.rejects(auth.logout(), { code: 'NETWORK_ERROR' });
  await assert.rejects(auth.getProfile(), { status: 401 }); assert.equal(getCalls, 1);
});

test('malformed profile responses and security-field leakage are rejected', async () => {
  for (const exposed of [{ ...profile, passwordHash: 'must not expose' }, { ...profile, role: 'admin' },
    { ...profile, isActive: true }, { ...profile, createdAt: 'invalid' }, { ...profile, tokenHash: 'must not expose' }]) {
    const auth = createAuthService({ post: async () => ({ success: true, data: { user: loginUser, accessToken: 'synthetic', expiresIn: 900 } }),
      get: async () => ({ success: true, data: { user: exposed } }), patch: async () => ({ success: true, data: { user: exposed } }) });
    await auth.login({ email: profile.email, password: 'Synthetic' });
    await assert.rejects(auth.getProfile(), { code: 'INVALID_RESPONSE' });
    await assert.rejects(auth.updateProfile({ displayName: 'Reader' }), { code: 'INVALID_RESPONSE' });
  }
});

test('display-name validation mirrors trimming, model lengths and control-character rules', () => {
  for (const name of ['A', '  Reader  ', 'x'.repeat(80), 'Reader 漢字']) assert.equal(displayNameError(name), '');
  for (const name of ['', '   ', 'x'.repeat(81), 'Reader\nName', 'Reader\tName', 'Reader\u007fName', null, {}, []]) assert.ok(displayNameError(name));
});

test('settings route and form retain page structure, safe read-only fields and account navigation', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const { default: Form } = await server.ssrLoadModule('/src/features/account/AccountSettingsForm.jsx');
    const render = element => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/account/settings'] }, element));
    const route = render(createElement(Routes)); assert.ok(route.includes('Account settings')); assert.ok(route.includes('Loading content'));
    assert.equal((route.match(/<main\b/g) ?? []).length, 1); assert.equal((route.match(/<h1\b/g) ?? []).length, 1);
    for (const verified of [false, true]) {
      const html = render(createElement(Form, { profile: { ...profile, emailVerified: verified }, onSave: async () => profile, onLogout: async () => {} }));
      assert.ok(html.includes('value="Synthetic Reader"')); assert.ok(html.includes(profile.email)); assert.ok(html.includes('2026-10-22'));
      assert.ok(html.includes(verified ? '>Verified<' : '>Not verified<')); assert.equal(html.includes('not verified yet'), !verified);
      assert.ok(html.includes('Save display name')); assert.ok(html.includes('Log out')); assert.ok(html.includes('/account/change-password'));
      assert.ok(html.includes('name="displayName"')); assert.ok(!html.includes('name="email"')); assert.ok(!html.includes('name="role"'));
      assert.ok(html.includes('Email address changes are not available yet.'));
    }
  } finally { await server.close(); }
});
