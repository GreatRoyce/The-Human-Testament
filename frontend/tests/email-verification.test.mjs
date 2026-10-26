import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createAuthService } from '../src/services/auth.service.js';
import { readAccountToken, scrubAccountLink } from '../src/features/auth/resetLink.js';

const user = { id: '123456789012345678901234', email: 'reader@example.test', displayName: 'Reader', role: 'user', emailVerified: false, isActive: true };

test('verification requests use shared transport, allowlisted inputs and retain the current session', async () => {
  const calls = [];
  let verified = false;
  const service = createAuthService({
    post: async (path, body, options) => {
      calls.push({ path, body, options });
      if (path.endsWith('/login')) return { success: true, data: { user, accessToken: 'synthetic-access', expiresIn: 900 } };
      if (path.endsWith('/verify-email')) verified = true;
      return { success: true, data: { message: 'Safe account-neutral message.' } };
    },
    get: async (path, options) => {
      calls.push({ path, options }); return { success: true, data: { user: { ...user, emailVerified: verified } } };
    },
  });
  const signal = new AbortController().signal;
  await service.resendVerification({ email: user.email, redirect: 'must not forward', isActive: true }, { signal });
  await service.login({ email: user.email, password: 'Synthetic passphrase!' });
  await service.verifyEmail({ token: 'synthetic-verification', userId: 'must not forward', emailVerified: true }, { signal });
  assert.equal((await service.getCurrentUser()).emailVerified, true);
  assert.deepEqual(calls.map(call => call.path), ['/api/auth/resend-verification', '/api/auth/login', '/api/auth/verify-email', '/api/auth/me']);
  assert.deepEqual(calls[0].body, { email: user.email }); assert.deepEqual(calls[2].body, { token: 'synthetic-verification' });
  for (const index of [0, 2]) {
    assert.equal(calls[index].options.credentials, 'include'); assert.equal(calls[index].options.headers['X-CSRF-Protection'], '1');
    assert.equal(calls[index].options.signal, signal);
  }
  assert.equal(calls[3].options.headers.Authorization, 'Bearer synthetic-access');
  const invalid = createAuthService({ post: async () => ({ success: true, data: { tokenHash: 'must not expose' } }) });
  await assert.rejects(invalid.verifyEmail({ token: 'synthetic' }), { code: 'INVALID_RESPONSE' });
});

test('verification fragments are removed from history without storing them or accepting query credentials', () => {
  const raw = 'v'.repeat(43), replaced = [];
  const browser = { location: { href: `https://reader.example.test/verify-email?token=untrusted&keep=yes#token=${raw}`, hash: '#token=' + raw },
    history: { state: { key: 'verify-page', idx: 1 }, replaceState: (...args) => replaced.push(args) } };
  assert.equal(readAccountToken(browser.location), raw); scrubAccountLink(browser);
  assert.deepEqual(replaced, [[{ key: 'verify-page', idx: 1 }, '', '/verify-email?keep=yes']]);
  assert.ok(!JSON.stringify(replaced).includes(raw));
  assert.equal(readAccountToken({ hash: '', search: '?token=untrusted' }), '');
});

test('verification routes show safe navigation and ownership notices without rendering credentials', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const { default: Notice } = await server.ssrLoadModule('/src/features/auth/VerificationNotice.jsx');
    const render = route => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [route] }, createElement(Routes)));
    for (const [path, expected] of [['/verification-pending', 'Resend verification link'], ['/verify-email', 'expired'], ['/login', 'Verify your email or request a new link']]) {
      const html = render(path); assert.ok(html.includes(expected));
      assert.equal((html.match(/<main\b/g) ?? []).length, 1); assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    }
    const pending = render('/verification-pending'); assert.ok(pending.includes('Continue reading'));
    const previous = globalThis.window, token = 'v'.repeat(43);
    globalThis.window = { location: { hash: '#token=' + token } };
    try {
      const html = render('/verify-email'); assert.ok(html.includes('Verify email')); assert.ok(html.includes('Opening this page alone'));
      assert.ok(!html.includes(token)); assert.ok(!html.includes('name="token"')); assert.ok(html.includes('Continue reading'));
    } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
    const notice = profile => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Notice, { user: profile })));
    assert.ok(notice(user).includes('not verified yet')); assert.ok(notice(user).includes('continue reading'));
    assert.equal(notice({ ...user, emailVerified: true }), ''); assert.equal(notice(undefined), '');
  } finally { await server.close(); }
});
