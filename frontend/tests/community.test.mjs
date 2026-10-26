import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '../src/services/api/client.js';
import { createAuthService } from '../src/services/auth.service.js';
import { createCommunityService } from '../src/services/community.service.js';
const user = { id: 'a'.repeat(24), email: 'reader@example.test', displayName: 'Reader', role: 'user', emailVerified: true, isActive: true };
const dates = { createdAt: '2026-10-24T12:00:00.000Z', updatedAt: '2026-10-24T12:00:00.000Z' };
const author = { id: user.id, displayName: '<img src=x onerror=alert(1)>' };
const discussion = { id: 'b'.repeat(24), author, title: '<script>alert(1)</script>', body: '  Exact reader text\n<script>alert(2)</script>  ',
  verseId: 'freedom:10:14', bookId: 'freedom', chapterNumber: 10, visibility: 'public', status: 'active', ...dates, commentCount: 1, canEdit: true, canDelete: true };
const comment = { id: 'c'.repeat(24), discussionId: discussion.id, author, body: '<svg onload=alert(1)>Reader reply</svg>', status: 'active', ...dates, canEdit: true };
const circle = { id: 'd'.repeat(24), name: '<script>circle</script>', description: '<img src=x onerror=alert(1)>', owner: author,
  visibility: 'private', membershipPolicy: 'invitation', status: 'active', membership: { role: 'owner', status: 'active' }, canManage: true, ...dates };
const pagination = { page: 1, limit: 20, total: 1, pages: 1 };
const login = () => ({ success: true, data: { user, accessToken: 'synthetic-access', expiresIn: 900 } });

test('community transport supports anonymous reads, protected writes, exact text and restricted session destinations', async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.pathname.endsWith('/login')) return Response.json(login());
    if (init.method === 'DELETE') return Response.json({ success: true, data: { message: 'Removed.' } });
    const list = init.method === 'GET' && ['/api/discussions', `/api/discussions/${discussion.id}/comments`].includes(url.pathname);
    const row = url.pathname.endsWith('/comments') ? comment : discussion;
    return Response.json({ success: true, data: list ? { items: [row], pagination } : { item: row } });
  } });
  const auth = createAuthService(client), service = createCommunityService(auth), signal = new AbortController().signal;
  await service.discussions({ verseId: discussion.verseId, bookId: 'freedom', chapterNumber: 10 }, { signal });
  assert.equal(calls[0].init.headers.Authorization, undefined); assert.equal(calls[0].url.searchParams.get('verseId'), discussion.verseId);
  assert.equal(calls[0].init.signal, signal);
  await assert.rejects(service.createDiscussion(discussion), { status: 401 }); assert.equal(calls.length, 1);
  const version = auth.getSessionVersion();
  for (let i = 0; i < 3; i++) await assert.rejects(auth.getCurrentUser(), { status: 401 });
  assert.equal(auth.getSessionVersion(), version, 'Anonymous identity checks must not create a resource reload loop.');
  await auth.login({ email: user.email, password: 'Synthetic' });
  assert.deepEqual(await service.createDiscussion({ ...discussion, author: 'never forward', status: 'hidden', role: 'owner' }, { signal }), discussion);
  const mutation = calls.at(-1); assert.deepEqual(JSON.parse(mutation.init.body), { title: discussion.title, body: discussion.body, bookId: discussion.bookId, chapterNumber: 10, verseId: discussion.verseId });
  assert.equal(mutation.init.headers.Authorization, 'Bearer synthetic-access'); assert.equal(mutation.init.headers['X-CSRF-Protection'], '1');
  assert.equal(mutation.init.credentials, 'include'); assert.equal(mutation.init.signal, signal);
  await service.updateDiscussion(discussion.id, { title: 'Edit', author: 'Denied' });
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { title: 'Edit' });
  await service.deleteDiscussion(discussion.id); assert.equal(calls.at(-1).init.method, 'DELETE'); assert.equal(calls.at(-1).init.body, '{}');
  assert.deepEqual(await service.comments(discussion.id), { items: [comment], pagination });
  for (const path of ['https://attacker.test/api/discussions', '/api/discussions/../users/me', '/api/discussions?author=x', '/api/users/me', '/api/notes', '/api/reading-circles/' + circle.id + '/members/../users'])
    await assert.rejects(auth.communityRequest('get', path), { code: 'INVALID_INPUT' });
  assert.throws(() => service.discussion('../secret'), { code: 'INVALID_INPUT' }); assert.equal(auth.accessToken, undefined);
});

test('late community and identity responses cannot reveal a previous session or clear a newer login', async () => {
  let resolvePending, rejectPending, deferred = false;
  const auth = createAuthService({ post: async () => login(), get: async () => deferred ? new Promise((resolve, reject) => { resolvePending = resolve; rejectPending = reject; }) : { success: true, data: { user } } });
  await auth.login({}); deferred = true;
  let pending = auth.communityRequest('get', '/api/discussions');
  await auth.logout(); resolvePending({ success: true, data: { items: [discussion], pagination } });
  await assert.rejects(pending, { status: 401 });
  await auth.login({}); pending = auth.getCurrentUser();
  await auth.logout(); await auth.login({}); const current = auth.getSessionVersion();
  rejectPending(Object.assign(new Error('Old session expired'), { status: 401 }));
  await assert.rejects(pending, { status: 401 }); assert.equal(auth.getSessionVersion(), current);
  deferred = false; assert.deepEqual(await auth.getCurrentUser(), user);
});

test('community response schemas reject credential, email, moderation and private-field leaks', async () => {
  for (const changed of [{ ...discussion, passwordHash: 'secret' }, { ...discussion, author: { ...author, email: user.email } },
    { ...discussion, status: 'hidden' }, { ...discussion, reporter: user.id }, { ...discussion, body: 'x'.repeat(10001) }, { ...discussion, createdAt: 'invalid' }]) {
    const service = createCommunityService({ communityRequest: async () => ({ success: true, data: { item: changed } }) });
    await assert.rejects(service.discussion(discussion.id), { code: 'INVALID_RESPONSE' });
  }
  const badCircle = createCommunityService({ communityRequest: async () => ({ success: true, data: { item: { ...circle, memberships: [{ email: user.email }] } } }) });
  await assert.rejects(badCircle.circle(circle.id), { code: 'INVALID_RESPONSE' });
  const badPage = createCommunityService({ communityRequest: async () => ({ success: true, data: { items: [discussion], pagination: { ...pagination, limit: 1000 } } }) });
  await assert.rejects(badPage.discussions(), { code: 'INVALID_RESPONSE' });
});

test('circle, report and moderation services preserve endpoint contracts and strip untrusted roles', async () => {
  const calls = [];
  const service = createCommunityService({ communityRequest: async (method, path, body, options) => {
    calls.push({ method, path, body, options });
    const data = path === '/api/reading-circles' && method === 'post' || path === '/api/reading-circles/' + circle.id && method === 'patch' ? { item: circle } :
      path === '/api/reports' ? { id: 'e'.repeat(24), status: 'open' } : { message: 'Updated.' };
    return { success: true, data };
  } });
  await service.createCircle({ ...circle, owner: 'Untrusted', role: 'owner' });
  assert.deepEqual(calls.at(-1).body, { name: circle.name, description: circle.description, visibility: 'private', membershipPolicy: 'invitation' });
  await service.updateCircle(circle.id, { name: 'Updated', owner: 'No' }); assert.deepEqual(calls.at(-1).body, { name: 'Updated' });
  await service.join(circle.id); assert.equal(calls.at(-1).path, `/api/reading-circles/${circle.id}/join`); assert.deepEqual(calls.at(-1).body, {});
  await service.leave(circle.id); assert.equal(calls.at(-1).path, `/api/reading-circles/${circle.id}/leave`);
  await service.manageMember(circle.id, user.id, 'invite'); assert.deepEqual(calls.at(-1).body, { action: 'invite' });
  await service.report({ targetType: 'discussion', targetId: discussion.id, reason: 'spam', details: '<script>text</script>', reporter: 'No', status: 'resolved' });
  assert.deepEqual(calls.at(-1).body, { targetType: 'discussion', targetId: discussion.id, reason: 'spam', details: '<script>text</script>' });
  await service.moderate({ targetType: 'comment', targetId: comment.id, action: 'hide', reason: 'Policy', moderator: 'No' });
  assert.deepEqual(calls.at(-1).body, { targetType: 'comment', targetId: comment.id, action: 'hide', reason: 'Policy' });
  await service.review('e'.repeat(24), 'resolved', 'Reviewed'); assert.equal(calls.at(-1).path, '/api/moderation/reports/' + 'e'.repeat(24));
});

test('community cards, comments, forms and states escape UGC and conceal moderation controls from ordinary readers', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const render = (Component, props, path = '/community') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    const { default: Card } = await server.ssrLoadModule('/src/components/community/DiscussionCard.jsx');
    const { default: CircleCard } = await server.ssrLoadModule('/src/components/community/ReadingCircleCard.jsx');
    const { default: Thread } = await server.ssrLoadModule('/src/components/community/DiscussionThread.jsx');
    const ui = await server.ssrLoadModule('/src/components/community/CommunityUI.jsx');
    for (const html of [render(Card, { discussion }), render(CircleCard, { circle }), render(Thread, { items: [comment], onChanged: () => {}, canReport: true, canModerate: false })]) {
      assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src=x')); assert.ok(!html.includes('<svg onload=')); assert.ok(html.includes('&lt;'));
    }
    const normal = render(Thread, { items: [comment], canReport: true, canModerate: false, onChanged: () => {} });
    assert.ok(normal.includes('Edit or remove your comment')); assert.ok(normal.includes('maxLength="5000"')); assert.ok(normal.includes('Report content')); assert.ok(!normal.includes('Moderation actions'));
    const moderator = render(Thread, { items: [comment], canReport: true, canModerate: true, onChanged: () => {} });
    assert.ok(moderator.includes('Moderation actions')); assert.ok(moderator.includes('Moderation reason'));
    const frame = render(ui.CommunityFrame, { title: 'Reader discussions', identity: { data: user, loading: false }, children: createElement('p', null, 'Community content') });
    assert.ok(frame.includes('separate from the canonical manuscript')); assert.ok(frame.includes(user.id)); assert.ok(!frame.includes('href="/community/moderation"'));
    assert.equal((frame.match(/<main\b/g) ?? []).length, 1); assert.equal((frame.match(/<h1\b/g) ?? []).length, 1);
    const anon = render(ui.CommunityFrame, { title: 'Community', identity: { data: null, loading: false } }); assert.ok(anon.includes('/login'));
    const unverified = render(ui.CommunityFrame, { title: 'Community', identity: { data: { ...user, emailVerified: false }, loading: false } }); assert.ok(unverified.includes('/verification-pending'));
    const empty = render(ui.Resource, { resource: { loading: false, data: { items: [] } }, empty: 'No discussions yet.', children: () => 'Should not display' }); assert.ok(empty.includes('No discussions yet.')); assert.ok(!empty.includes('Should not display'));
    const error = render(ui.Resource, { resource: { loading: false, error: { message: 'Community unavailable.' }, retry() {} }, children: () => '' }); assert.ok(error.includes('Community unavailable.'));
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    for (const path of ['/community', '/community/discussions', '/community/discussions/' + discussion.id, '/community/reading-circles', '/community/reading-circles/' + circle.id, '/community/moderation']) {
      const html = render(Routes, {}, path); assert.equal((html.match(/<main\b/g) ?? []).length, 1, path); assert.equal((html.match(/<h1\b/g) ?? []).length, 1, path); assert.ok(!html.includes('not available yet'), path);
    }
    const { default: Controls } = await server.ssrLoadModule('/src/features/reader/components/ReaderControls.jsx');
    const reader = render(Controls, { selectedVerse: { canonicalId: discussion.verseId, bookSlug: 'freedom', chapterNumber: 10, number: 14 } });
    assert.ok(reader.includes('/community/discussions?verseId=freedom%3A10%3A14')); assert.ok(reader.includes('/reading/notes'));
  } finally { await server.close(); }
});
