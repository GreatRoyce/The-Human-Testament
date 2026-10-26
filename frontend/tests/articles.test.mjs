import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '../src/services/api/client.js';
import { createAuthService } from '../src/services/auth.service.js';
import { createArticlesService } from '../src/services/articles.service.js';
import { parseArticleReferences, formatArticleReferences, safeCoverUrl, referenceUrl } from '../src/features/articles/articleInput.js';
const user = { id: 'a'.repeat(24), email: 'reader@example.test', displayName: 'Reader', role: 'user', emailVerified: true, isActive: true };
const content = { title: '<script>reader title</script>', subtitle: '<img src=x onerror=alert(1)>', body: '  Reader argument\n<script>alert(1)</script>  ',
  excerpt: 'Reader summary', coverImage: '', tags: ['reflection'], category: 'essay', canonicalReferences: [{ bookId: 'freedom', chapterNumber: 10, verseId: 'freedom:10:14' }] };
const article = { ...content, id: 'b'.repeat(24), author: { id: user.id, displayName: user.displayName }, slug: 'reader-essay-1234567890abcdef', status: 'published', revision: 2,
  publishedAt: '2026-10-26T12:00:00.000Z', createdAt: '2026-10-26T10:00:00.000Z', updatedAt: '2026-10-26T12:00:00.000Z' };
const own = { ...article, status: 'draft', reviewReason: '' };
const summary = ({ body: _body, canonicalReferences: _refs, ...rest }) => { void _body; void _refs; return rest; };
const pagination = { page: 1, limit: 20, total: 1, pages: 1 };
test('article service reuses restricted session transport, anonymous reads and safe management contracts', async () => {
  const calls = [];
  const auth = createAuthService(createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.pathname.endsWith('/login')) return Response.json({ success: true, data: { user, accessToken: 'synthetic-token', expiresIn: 900 } });
    const publicPath = url.pathname === '/api/articles/' + article.slug;
    return Response.json({ success: true, data: url.pathname === '/api/articles' && init.method === 'GET' ? { items: [summary(article)], pagination } : { item: publicPath ? article : own } });
  } }));
  const service = createArticlesService(auth), signal = new AbortController().signal;
  assert.deepEqual(await service.list({ tag: 'reflection', category: 'essay', page: 1 }, { signal }), { items: [summary(article)], pagination });
  assert.equal(calls[0].init.headers.Authorization, undefined); assert.equal(calls[0].url.searchParams.get('category'), 'essay'); assert.equal(calls[0].init.signal, signal);
  assert.deepEqual(await service.get(article.slug), article);
  await assert.rejects(service.create(content), { status: 401 });
  await auth.login({ email: user.email, password: 'Synthetic' });
  assert.deepEqual(await service.create({ ...content, author: 'spoof', status: 'published', publishedAt: 'spoof' }), own);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), content);
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer synthetic-token'); assert.equal(calls.at(-1).init.headers['X-CSRF-Protection'], '1');
  await service.update(article.id, { body: 'Edit', expectedRevision: 2, author: 'spoof', status: 'published' });
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { body: 'Edit', expectedRevision: 2 });
  await service.submit(article.id, 3); assert.equal(calls.at(-1).url.pathname, `/api/articles/${article.id}/submit`);
  await service.review(article.id, { action: 'approve', reason: 'Review', expectedRevision: 3, moderator: 'spoof' });
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { action: 'approve', reason: 'Review', expectedRevision: 3 });
  for (const path of ['/api/articles/../users/me', 'https://attacker.test/api/articles', '/api/articles/mine/' + article.id + '/../other', '/api/articles/' + article.slug + '?status=draft'])
    await assert.rejects(auth.communityRequest('get', path), { code: 'INVALID_INPUT' });
  await assert.rejects(service.own('../other'), { code: 'INVALID_INPUT' });
});
test('public article decoding rejects draft exposure and ownership, credential or moderation leaks', async () => {
  for (const item of [{ ...article, status: 'draft' }, { ...article, status: 'archived' }, { ...article, passwordHash: 'secret' }, { ...article, reviewReason: 'private' },
    { ...article, author: { ...article.author, email: user.email } }, { ...article, coverImage: 'javascript:alert(1)' }, { ...article, publishedAt: 'bad' }]) {
    const service = createArticlesService({ communityRequest: async () => ({ success: true, data: { item } }) });
    await assert.rejects(service.get(article.slug), { code: 'INVALID_RESPONSE' });
  }
  const service = createArticlesService({ communityRequest: async () => ({ success: true, data: { items: [summary({ ...article, status: 'pending_review' })], pagination } }) });
  await assert.rejects(service.list(), { code: 'INVALID_RESPONSE' });
});
test('article references keep exact passage destinations and preview images exclude executable formats', () => {
  const references = parseArticleReferences('freedom\nfreedom:10\n freedom:10:14 ');
  assert.equal(formatArticleReferences(references), 'freedom\nfreedom:10\nfreedom:10:14');
  assert.deepEqual(references.map(referenceUrl), ['/testament/freedom', '/testament/freedom/10', '/testament/freedom/10/14']);
  for (const value of ['javascript:alert(1)', 'freedom:01:14', 'freedom:10:0', Array(13).fill('freedom').join('\n')]) assert.throws(() => parseArticleReferences(value));
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg>', 'https://images.test/a.svg', 'https://user:pass@images.test/a.png', 'https://images.test/a.png#fragment', 'https://images.test/a\n.png']) assert.equal(safeCoverUrl(value), undefined);
  assert.equal(safeCoverUrl('https://images.test/a.webp'), 'https://images.test/a.webp');
});
test('article editor, previews, cards and routes safely render reader content with the existing page structure', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const render = (Component, props, path = '/articles') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    const { default: Content } = await server.ssrLoadModule('/src/components/articles/ArticleContent.jsx');
    const { default: Editor } = await server.ssrLoadModule('/src/components/articles/ArticleEditor.jsx');
    const { default: Card } = await server.ssrLoadModule('/src/components/articles/ArticleCard.jsx');
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const html = render(Content, { article }); assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('Reader argument\n')); assert.ok(html.includes('/testament/freedom/10/14')); assert.ok(html.includes('separate from the canonical manuscript')); assert.ok(html.includes('2026-10-26'));
    const unsafe = render(Content, { article: { ...article, coverImage: 'javascript:alert(1)' } }); assert.ok(!unsafe.includes('src="javascript:'));
    const preview = render(Content, { article: { ...article, coverImage: 'https://images.test/a.png' }, preview: true }); assert.ok(!preview.includes('<img '));
    const editor = render(Editor, { article: own, onSave() {} });
    for (const field of ['title', 'subtitle', 'body', 'excerpt', 'tags', 'category', 'coverImage', 'references']) assert.ok(editor.includes(`name="${field}"`), field);
    for (const label of ['Save draft', 'Preview before submission', 'not editing the manuscript', 'maxLength="100000"']) assert.ok(editor.includes(label), label);
    assert.ok(!editor.includes('name="status"')); assert.ok(!editor.includes('name="author"')); assert.ok(!editor.includes('<script>'));
    const publicCard = render(Card, { article: summary(article) }); assert.ok(publicCard.includes('/articles/' + article.slug));
    const ownerCard = render(Card, { article: summary(article), management: true }); assert.ok(ownerCard.includes('/articles/mine/' + article.id));
    for (const path of ['/articles', '/articles/' + article.slug, '/articles/mine', '/articles/write', '/articles/mine/' + article.id, '/articles/moderation', '/articles/moderation/' + article.id]) {
      const page = render(Routes, {}, path); assert.equal((page.match(/<main\b/g) || []).length, 1, path); assert.equal((page.match(/<h1\b/g) || []).length, 1, path);
      assert.ok(page.includes('Article navigation'), path); assert.ok(!page.includes('Record publication decision'), 'Unfetched or unauthorized review data must not show moderation controls.');
    }
  } finally { await server.close(); }
});
