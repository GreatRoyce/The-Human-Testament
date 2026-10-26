import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createAuthService } from '../src/services/auth.service.js';
import { passwordFormError } from '../src/features/auth/passwordPolicy.js';
import { readResetToken, scrubResetLink } from '../src/features/auth/resetLink.js';

const user = { id: '123456789012345678901234', email: 'reader@example.test', displayName: 'Reader', role: 'user', emailVerified: false, isActive: true };
const password = 'A synthetic passphrase!';

test('recovery service uses shared POST transport, confirms passwords and clears access after credential changes', async () => {
  const calls = [];
  const service = createAuthService({ post: async (path, body, options) => {
    calls.push({ path, body, options });
    return { success: true, data: path.endsWith('/login') ? { user, accessToken: 'synthetic-access', expiresIn: 900 } : { message: 'Safe response.' } };
  } });
  await service.forgotPassword({ email: user.email, redirect: 'must not forward' });
  await service.resetPassword({ token: 'synthetic-reset', newPassword: password, passwordConfirmation: password, userId: 'must not forward' });
  await assert.rejects(service.getCurrentUser(), { status: 401 });
  await assert.rejects(service.changePassword({ currentPassword: password, newPassword: password, passwordConfirmation: password }), { status: 401 });
  await service.login({ email: user.email, password });
  await service.changePassword({ currentPassword: 'old synthetic', newPassword: password, passwordConfirmation: password, userId: 'must not forward' });
  await assert.rejects(service.getCurrentUser(), { status: 401 });
  assert.deepEqual(calls.map(call => call.path), ['/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/login', '/api/auth/change-password']);
  assert.deepEqual(Object.keys(calls[0].body), ['email']);
  assert.deepEqual(Object.keys(calls[1].body), ['token', 'newPassword', 'passwordConfirmation']);
  assert.deepEqual(Object.keys(calls[3].body), ['currentPassword', 'newPassword', 'passwordConfirmation']);
  assert.equal(calls[3].options.headers.Authorization, 'Bearer synthetic-access');
  for (const call of calls) {
    assert.equal(call.options.credentials, 'include'); assert.equal(call.options.headers['X-CSRF-Protection'], '1');
  }
});

test('weak, oversized Unicode passwords and mismatched confirmations have clear client-side validation', () => {
  assert.equal(passwordFormError({ newPassword: password, passwordConfirmation: password }), '');
  for (const value of ['short', ' '.repeat(12), '界'.repeat(25), 'a'.repeat(73), 'invalid\npassword!'])
    assert.ok(passwordFormError({ newPassword: value, passwordConfirmation: value }));
  assert.match(passwordFormError({ newPassword: password, passwordConfirmation: 'different' }), /does not match/);
});

test('recovery links are parsed from fragments and scrubbed without persisting credentials', () => {
  const token = 'a'.repeat(43), calls = [];
  const browserWindow = { location: { href: `https://reader.example.test/reset-password?token=untrusted&keep=yes#token=${token}`, hash: '#token=' + token },
    history: { state: { key: 'page', idx: 1 }, replaceState: (...args) => calls.push(args) } };
  assert.equal(readResetToken(browserWindow.location), token);
  scrubResetLink(browserWindow);
  assert.deepEqual(calls, [[{ key: 'page', idx: 1 }, '', '/reset-password?keep=yes']]);
  assert.ok(!JSON.stringify(calls).includes(token));
});

test('recovery pages preserve page structure and never render the reset token into markup', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const render = route => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [route] }, createElement(Routes)));
    for (const [path, expected] of [['/login', 'Forgot your password?'], ['/forgot-password', 'Request reset link'],
      ['/reset-password', 'Request a new reset link'], ['/account/change-password', 'Loading content']]) {
      const html = render(path);
      assert.ok(html.includes(expected));
      assert.equal((html.match(/<main\b/g) ?? []).length, 1); assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    }
    const previous = globalThis.window;
    const token = 'a'.repeat(43);
    // SSR fixture exercises initial fragment parsing only; browser effects are
    // verified separately when a browser connection is available.
    globalThis.window = { location: { hash: '#token=' + token } };
    try {
      const html = render('/reset-password');
      assert.ok(html.includes('Confirm new password')); assert.match(html, /autocomplete="new-password"/i);
      assert.ok(!html.includes(token)); assert.ok(!html.includes('name="token"'));
    } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
  } finally { await server.close(); }
});
