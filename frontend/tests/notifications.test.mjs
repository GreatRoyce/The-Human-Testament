import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '../src/services/api/client.js';
import { createAuthService } from '../src/services/auth.service.js';
import { createNotificationsService } from '../src/services/notifications.service.js';
const user = { id: 'a'.repeat(24), email: 'reader@example.test', displayName: 'Reader', role: 'user', emailVerified: true, isActive: true };
const item = { id: 'b'.repeat(24), type: 'discussion_comment', resourceType: 'comment', resourceId: 'c'.repeat(24),
  actor: { id: 'd'.repeat(24), displayName: '<script>reader</script>' }, message: 'Someone commented on your discussion.',
  targetUrl: '/community/discussions/' + 'e'.repeat(24), readAt: null, createdAt: '2026-10-26T12:00:00.000Z' };
const pagination = { page: 1, limit: 20, total: 1, pages: 1 };
const login = () => ({ success: true, data: { user, accessToken: 'synthetic-access', expiresIn: 900 } });
test('notification API reuses private authentication, scopes destinations and sends only empty read mutation bodies', async () => {
  const calls = [];
  const auth = createAuthService(createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.pathname.endsWith('/login')) return Response.json(login());
    const data = url.pathname.endsWith('/unread-count') ? { unreadCount: 1 } : url.pathname.endsWith('/read-all') ? { markedCount: 1 } :
      init.method === 'PATCH' ? { item: { ...item, readAt: '2026-10-26T13:00:00.000Z' } } : { items: [item], pagination };
    return Response.json({ success: true, data });
  } }));
  const service = createNotificationsService(auth), epoch = auth.getSessionVersion();
  for (let i = 0; i < 3; i++) await assert.rejects(service.unreadCount(), { status: 401 });
  assert.equal(calls.length, 0); assert.equal(auth.getSessionVersion(), epoch, 'Anonymous indicator reads must not cause repeated session/resource reloads.');
  await auth.login({ email: user.email, password: 'Synthetic' }); const signal = new AbortController().signal;
  assert.deepEqual(await service.list({ page: 1, limit: 20 }, { signal }), { items: [item], pagination });
  assert.equal(await service.unreadCount({ signal }), 1);
  assert.equal((await service.read(item.id, { signal })).readAt, '2026-10-26T13:00:00.000Z');
  assert.deepEqual(await service.readAll({ signal }), { markedCount: 1 });
  for (const { init } of calls.slice(1)) {
    assert.equal(init.headers.Authorization, 'Bearer synthetic-access'); assert.equal(init.credentials, 'include'); assert.equal(init.signal, signal);
    if (['PATCH', 'POST'].includes(init.method)) { assert.equal(init.body, '{}'); assert.equal(init.headers['X-CSRF-Protection'], '1'); }
  }
  for (const path of ['/api/notifications/../users/me', '/api/notifications?recipient=x', '/api/notifications/' + item.id, 'https://attacker.test/api/notifications']) await assert.rejects(auth.privateRequest('get', path), { code: 'INVALID_INPUT' });
  await assert.rejects(service.read('../foreign'), { code: 'INVALID_INPUT' });
});
test('strict notification responses reject private fields, malformed counts and unsafe or unredacted resource links', async () => {
  for (const changed of [{ ...item, recipient: user.id }, { ...item, eventKey: 'private' }, { ...item, passwordHash: 'secret' },
    { ...item, actor: { ...item.actor, email: user.email } }, { ...item, targetUrl: 'javascript:alert(1)' },
    { ...item, targetUrl: '//attacker.test' }, { ...item, targetUrl: '/api/moderation/reports' }, { ...item, targetUrl: '/community/reading-circles?scope=mine' },
    { ...item, type: 'unavailable' }, { ...item, createdAt: 'bad' }]) {
    const service = createNotificationsService({ privateRequest: async () => ({ success: true, data: { items: [changed], pagination } }) });
    await assert.rejects(service.list(), { code: 'INVALID_RESPONSE' });
  }
  for (const unreadCount of [-1, '4', 1.5]) await assert.rejects(createNotificationsService({ privateRequest: async () => ({ success: true, data: { unreadCount } }) }).unreadCount(), { code: 'INVALID_RESPONSE' });
  const unavailable = { ...item, type: 'unavailable', resourceType: null, resourceId: null, actor: null, targetUrl: null, message: 'This activity is no longer available.' };
  assert.deepEqual((await createNotificationsService({ privateRequest: async () => ({ success: true, data: { items: [unavailable], pagination } }) }).list()).items[0], unavailable);
});
test('late notification responses cannot reappear after logout or clear a newer account session', async () => {
  let resolvePending, rejectPending;
  const auth = createAuthService({ post: async () => login(), get: async () => new Promise((resolve, reject) => { resolvePending = resolve; rejectPending = reject; }) });
  const service = createNotificationsService(auth);
  await auth.login({}); let pending = service.list(); await auth.logout();
  resolvePending({ success: true, data: { items: [item], pagination } }); await assert.rejects(pending, { status: 401 });
  await auth.login({}); pending = service.unreadCount(); await auth.logout(); await auth.login({}); const current = auth.getSessionVersion();
  rejectPending(Object.assign(new Error('Old session'), { status: 401 })); await assert.rejects(pending, { status: 401 }); assert.equal(auth.getSessionVersion(), current);
});
test('notification list escapes actors/messages, distinguishes read state and never links unavailable activity', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const render = (Component, props, path = '/notifications') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    const { default: List } = await server.ssrLoadModule('/src/components/notifications/NotificationList.jsx');
    const { default: Link } = await server.ssrLoadModule('/src/components/notifications/NotificationLink.jsx');
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const html = render(List, { items: [{ ...item, message: '<img src=x onerror=alert(1)>' }], onRead() {} });
    assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('Unread')); assert.ok(html.includes('Mark as read')); assert.ok(html.includes(item.targetUrl));
    const read = render(List, { items: [{ ...item, readAt: '2026-10-26T13:00:00.000Z' }], onRead() {} }); assert.ok(read.includes('Read')); assert.ok(!read.includes('Mark as read'));
    const hidden = render(List, { items: [{ ...item, actor: null, type: 'unavailable', resourceId: null, resourceType: null, targetUrl: null }], onRead() {} }); assert.ok(!hidden.includes('href=')); assert.ok(hidden.includes('no longer have access'));
    const page = render(Routes, {}); assert.equal((page.match(/<main\b/g) || []).length, 1); assert.equal((page.match(/<h1\b/g) || []).length, 1);
    assert.ok(page.includes('Notifications')); assert.ok(page.includes('Refresh notifications')); assert.ok(page.includes('does not poll')); assert.ok(page.includes('Loading content'));
    assert.ok(render(Link, {}, '/testament').includes('href="/notifications"'));
  } finally { await server.close(); }
});
