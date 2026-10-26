import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '../src/services/api/client.js';
import { createAuthService } from '../src/services/auth.service.js';
import { createAdministrationService } from '../src/services/administration.service.js';
const id = 'a'.repeat(24), userId = 'b'.repeat(24);
const identity = { id, email: 'admin@example.test', displayName: 'Admin', role: 'user', emailVerified: true, isActive: true };
const account = { ...identity, id: userId, displayName: '<script>reader</script>', createdAt: '2026-10-26T08:00:00.000Z', updatedAt: '2026-10-26T08:00:00.000Z',
  permissions: { administration: false, analyticsOwner: false, analyticsAdmin: false, globalModerator: false } };
const capabilities = { administration: true, globalModerator: true, roleManagement: false, analyticsConfigured: true };
const audit = { id: 'c'.repeat(24), moderatorId: id, targetId: userId, targetType: 'user', action: 'deactivate', reason: 'Reviewed <script>unsafe</script>',
  previousStatus: 'active', resultingStatus: 'deactivated', createdAt: '2026-10-26T09:00:00.000Z', source: 'administration', operatorLabel: '' };
const pagination = { page: 1, limit: 20, total: 1, pages: 1 };
const login = () => ({ success: true, data: { user: identity, accessToken: 'synthetic-token', expiresIn: 900 } });
const unavailable = { available: false, message: 'This service is disabled or its storage is unavailable.' };
const overview = () => ({ users: { total: 10, active: 9, deactivated: 1, recent: 2, recentDays: 7 }, articles: unavailable, reports: unavailable, analytics: unavailable,
  recentActions: [], communityQueue: { available: false, message: 'Discussions and comments publish immediately. No prepublication queue exists.' },
  health: { authentication: 'ready', administration: 'ready', timestamp: '2026-10-26T12:00:00.000Z' } });
test('administration transport is authenticated, destination-restricted and preserves filters, CSRF and status preconditions', async () => {
  const calls = [];
  const auth = createAuthService(createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url, init) => {
    calls.push({ url, init }); if (url.pathname.endsWith('/login')) return Response.json(login());
    const data = url.pathname.endsWith('/capabilities') ? capabilities : url.pathname.endsWith('/overview') ? overview() : url.pathname.endsWith('/audit') ? { items: [audit], pagination } :
      url.pathname.endsWith('/status') ? { id: userId, isActive: false, message: 'Account deactivated and credentials revoked.' } : url.pathname.endsWith('/users') ? { items: [account], pagination } : { item: account };
    return Response.json({ success: true, data });
  } }));
  const service = createAdministrationService(auth), epoch = auth.getSessionVersion();
  await assert.rejects(service.capabilities(), { status: 401 }); assert.equal(auth.getSessionVersion(), epoch); assert.equal(calls.length, 0);
  await auth.login({}); const signal = new AbortController().signal;
  assert.deepEqual(await service.capabilities(), capabilities); assert.deepEqual(await service.overview(), overview());
  assert.deepEqual((await service.users({ q: 'literal.*', status: 'active', role: 'administrator', start: '', end: '' }, { signal })).items, [account]);
  assert.equal(calls.at(-1).url.searchParams.get('q'), 'literal.*'); assert.equal(calls.at(-1).url.searchParams.has('start'), false); assert.equal(calls.at(-1).init.signal, signal);
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer synthetic-token'); assert.equal(calls.at(-1).init.credentials, 'include');
  assert.deepEqual(await service.user(userId), account); assert.deepEqual((await service.audit({ targetType: 'user', targetId: userId })).items, [audit]);
  await service.setStatus(userId, { isActive: false, expectedIsActive: true, reason: 'Reviewed', role: 'admin', administration: true });
  assert.equal(calls.at(-1).init.method, 'PATCH'); assert.equal(calls.at(-1).init.headers['X-CSRF-Protection'], '1');
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { isActive: false, expectedIsActive: true, reason: 'Reviewed' });
  for (const path of ['https://attacker.test', '/api/admin/users/' + userId + '/role', '/api/admin/audit/' + audit.id, '/api/admin/books', '/api/users/me', '/api/admin/permissions']) await assert.rejects(auth.administrationRequest('patch', path, {}), { code: 'INVALID_INPUT' });
  await assert.rejects(service.user('../auth/me'), { code: 'INVALID_INPUT' });
});
test('admin contracts reject credentials, private data, invented roles and fabricated unavailable counts', async () => {
  for (const bad of [{ ...account, passwordHash: 'secret' }, { ...account, sessionToken: 'secret' }, { ...account, privateNotes: ['secret'] }, { ...account, role: 'admin' }]) {
    const service = createAdministrationService({ administrationRequest: async () => ({ success: true, data: { item: bad } }) }); await assert.rejects(service.user(userId), { code: 'INVALID_RESPONSE' });
  }
  for (const data of [{ ...overview(), articles: { available: false, message: 'Unavailable', data: { pending: 0 } } }, { ...overview(), users: { ...overview().users, total: -1 } }, { ...overview(), recentActions: [{ ...audit, password: 'secret' }] }]) {
    const service = createAdministrationService({ administrationRequest: async () => ({ success: true, data }) }); await assert.rejects(service.overview(), { code: 'INVALID_RESPONSE' });
  }
});
test('late admin responses cannot cross logout/login boundaries or erase a newer session', async () => {
  let resolvePending, rejectPending;
  const auth = createAuthService({ post: async () => login(), get: async () => new Promise((resolve, reject) => { resolvePending = resolve; rejectPending = reject; }) });
  const service = createAdministrationService(auth);
  await auth.login({}); let pending = service.users(); await auth.logout(); resolvePending({ success: true, data: { items: [account], pagination } }); await assert.rejects(pending, { status: 401 });
  await auth.login({}); pending = service.overview(); await auth.logout(); await auth.login({}); const epoch = auth.getSessionVersion();
  rejectPending(Object.assign(new Error('Expired old session'), { status: 401 })); await assert.rejects(pending, { status: 401 }); assert.equal(auth.getSessionVersion(), epoch);
});
test('administration errors retain safe feedback and forbidden or conflict responses preserve the login', async () => {
  let status = 403;
  const auth = createAuthService({ post: async () => login(), get: async () => { throw Object.assign(new Error(status === 409 ? 'Reload account status.' : 'Permission required.'), { status }); }, patch: async () => { throw Object.assign(new Error('Reload account status.'), { status: 409 }); } });
  await auth.login({}); const epoch = auth.getSessionVersion(), service = createAdministrationService(auth);
  await assert.rejects(service.users(), { status: 403 }); assert.equal(auth.getSessionVersion(), epoch);
  await assert.rejects(service.setStatus(userId, { isActive: false, expectedIsActive: true, reason: 'Reviewed' }), /Reload account status/); assert.equal(auth.getSessionVersion(), epoch);
  status = 401; await assert.rejects(service.overview(), { status: 401 }); assert.notEqual(auth.getSessionVersion(), epoch);
});
test('admin screens follow existing page structure, guard child screens, show dependencies and escape audit/account content', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const render = (Component, props = {}, path = '/admin') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const { default: Overview } = await server.ssrLoadModule('/src/components/admin/AdminOverview.jsx');
    const { AuditEntries } = await server.ssrLoadModule('/src/components/admin/AdminAudit.jsx');
    const { default: StatusForm } = await server.ssrLoadModule('/src/components/admin/AccountStatusForm.jsx');
    const { default: AdminCommunity } = await server.ssrLoadModule('/src/pages/Admin/Community.jsx');
    const { default: AdminArticles } = await server.ssrLoadModule('/src/pages/Admin/Articles.jsx');
    const { default: Users } = await server.ssrLoadModule('/src/pages/Admin/Users.jsx');
    const { default: Queue } = await server.ssrLoadModule('/src/components/community/ModerationQueue.jsx');
    const { default: ArticleReview } = await server.ssrLoadModule('/src/components/articles/ArticleReview.jsx');
    for (const path of ['/admin', '/admin/users', '/admin/users/' + userId, '/admin/articles', '/admin/articles/' + userId, '/admin/community', '/admin/reports', '/admin/audit']) {
      const html = render(AppRoutes, {}, path); assert.equal((html.match(/<main\b/g) || []).length, 1); assert.equal((html.match(/<h1\b/g) || []).length, 1);
      assert.ok(html.includes('Administration')); assert.ok(html.includes('Loading content')); assert.ok(!html.includes('Find users'), 'Protected children must not mount until capability check succeeds.');
    }
    const absent = render(Overview, { data: overview() }); assert.ok(absent.includes('Analytics unavailable')); assert.ok(absent.includes('No prepublication queue')); assert.ok(absent.includes('No accessible actions'));
    assert.ok(!absent.includes('0 pending submissions')); assert.ok(!absent.includes('0 accessible open'));
    const history = render(AuditEntries, { items: [audit] }); assert.ok(history.includes('&lt;script&gt;')); assert.ok(!history.includes('<script>')); assert.ok(!history.includes('<button'));
    const form = render(StatusForm, { user: account, onDone() {} }); assert.ok(form.includes('Review: Deactivate account')); assert.ok(form.includes('required=""')); assert.ok(!form.includes('Confirm Deactivate account')); assert.ok(!form.includes('type="password"'));
    assert.ok(render(StatusForm, { user: { ...account, isActive: false }, onDone() {} }).includes('Review: Reactivate account'));
    const users = render(Users); for (const text of ['Find users', 'Role or permission', 'Account status', 'literal text', 'Registration', 'Registered from']) if (text !== 'Registration') assert.ok(users.includes(text), text);
    const queue = render(Queue); for (const text of ['Report reason', 'Content type', 'Report status', 'From date']) assert.ok(queue.includes(text), text);
    const contextRender = (Component, context) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/admin/test'] }, createElement(Routes, null,
      createElement(Route, { path: '/admin', element: createElement(Outlet, { context }) }, createElement(Route, { path: 'test', element: createElement(Component) })))));
    assert.ok(contextRender(AdminCommunity, { ...capabilities, globalModerator: false }).includes('separately provisioned global moderator'));
    assert.ok(contextRender(AdminArticles, { ...capabilities, globalModerator: false }).includes('does not bypass publication policy'));
    const article = { id: userId, title: '<script>Article title</script>', body: 'Reader content', subtitle: '', coverImage: '', excerpt: '', tags: [], category: '', canonicalReferences: [],
      status: 'pending_review', revision: 4, author: { id, displayName: 'Author' }, publishedAt: null, updatedAt: '2026-10-26T08:00:00.000Z', reviewReason: '' };
    const review = render(ArticleReview, { article, refresh() {} }); assert.ok(review.includes('Review: Record publication decision')); assert.ok(review.includes('version 4')); assert.ok(review.includes('Approve publication')); assert.ok(review.includes('Reject submission')); assert.ok(review.includes('&lt;script&gt;Article'));
  } finally { await server.close(); }
});
