const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.NODE_ENV = 'production'; process.env.CONTENT_SOURCE = 'pdf'; process.env.AUTH_ENABLED = 'true';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url'); process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test';
process.env.COMMUNITY_POSTING_ENABLED = 'true'; process.env.ARTICLE_COVER_IMAGE_ORIGINS = 'https://images.example.test'; process.env.MAIL_DELIVERY_ENABLED = 'false';
delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
const app = require('../src/app');
const Article = require('../src/models/Article'), Publication = require('../src/models/ArticlePublication');
const User = require('../src/models/User'), Moderator = require('../src/models/CommunityModerator');
const Report = require('../src/models/ContentReport'), Audit = require('../src/models/ModerationAction');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { initializeCommunityStorage } = require('../src/services/communityStorage');
const { initializeArticleStorage, assertArticleStorage } = require('../src/services/articleStorage');
const { createSession } = require('../src/services/session.service');
const { getAuthConfig } = require('../src/config/auth');
const slugs = require('../src/utils/articleSlug');
const canonicalHash = () => createHash('sha256').update(readFileSync(require.resolve('../../shared/manuscript.json'))).digest('hex');
test('articles retain owned drafts, peer-reviewed publications and canonical separation', { timeout: 1800000 }, async t => {
  const before = canonicalHash(), memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  let server;
  try {
    assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
    await mongoose.connect(memory.getUri(), { dbName: 'articles_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage(); await initializeCommunityStorage(); await initializeArticleStorage();
    const passwordHash = await bcrypt.hash('Synthetic article test passphrase!', 12), users = {}, tokens = {};
    for (const name of ['alice', 'bob', 'moderator', 'unverified', 'limited']) {
      users[name] = await User.create({ email: `${name}@example.test`, displayName: name, passwordHash, emailVerified: name !== 'unverified' });
      tokens[name] = (await createSession(await User.findById(users[name]._id).select('+passwordHash'), getAuthConfig())).accessToken;
    }
    await Moderator.create({ user: users.moderator._id, grantedBy: 'synthetic-operator', reason: 'Disposable fixture' });
    app.set('trust proxy', 1); let count = 0;
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    async function request(path, { method = 'GET', body, user = 'alice', headers = {} } = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, signal: AbortSignal.timeout(20000), headers: {
        Origin: process.env.AUTH_ALLOWED_ORIGINS, 'Content-Type': 'application/json', 'X-CSRF-Protection': '1',
        'X-Forwarded-For': `198.19.${Math.floor(++count / 250)}.${count % 250 + 1}`,
        ...(user ? { Authorization: 'Bearer ' + (tokens[user] ?? user) } : {}), ...headers,
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json(), headers: response.headers };
    }
    const post = (path, body, user = 'alice') => request(path, { method: 'POST', body, user });
    const draft = (extra = {}, user = 'alice') => post('/api/articles', { title: 'A reader essay', body: '  EssayOnlyNeedle\n<script>alert(1)</script>  ', ...extra }, user);
    const own = async (id, user = 'alice') => (await request('/api/articles/mine/' + id, { user })).body.data?.item;
    const submit = async (id, user = 'alice') => post(`/api/articles/${id}/submit`, { expectedRevision: (await own(id, user)).revision }, user);
    const review = async (id, action, user = 'moderator') => {
      const current = await request('/api/articles/moderation/' + id, { user });
      return post(`/api/articles/${id}/review`, { action, reason: 'Synthetic review reason', expectedRevision: current.body.data?.item.revision ?? 0 }, user);
    };
    let id, slug, reportId;
    const publicBefore = await request('/api/verses/freedom:10:14', { user: null });
    await t.test('draft creation derives authorship and protects authentication, verification and CSRF', async () => {
      for (const user of [null, 'forged']) assert.equal((await draft({}, user)).status, 401);
      assert.equal((await draft({}, 'unverified')).status, 403);
      assert.equal((await request('/api/articles', { method: 'POST', body: { title: 'Denied', body: 'Denied' }, headers: { Origin: 'https://attacker.test' } })).status, 403);
      const result = await draft({ title: '  Reader essay  ', tags: [' Reflection ', 'reading'], category: 'essay', excerpt: 'An original reader contribution',
        coverImage: 'https://images.example.test/cover.webp', canonicalReferences: [{ bookId: 'freedom', chapterNumber: 10, verseId: 'freedom:10:14' }] });
      assert.equal(result.status, 201, JSON.stringify(result.body)); id = result.body.data.item.id; slug = result.body.data.item.slug;
      const row = result.body.data.item; assert.equal(row.title, 'Reader essay'); assert.equal(row.status, 'draft'); assert.equal(row.publishedAt, null);
      assert.equal(row.author.id, String(users.alice._id)); assert.equal(row.author.email, undefined); assert.equal(row.revision, 0); assert.ok(Date.parse(row.createdAt));
      assert.equal(row.body, '  EssayOnlyNeedle\n<script>alert(1)</script>  '); assert.deepEqual(row.tags, ['reflection', 'reading']);
      assert.equal(result.headers.get('cache-control'), 'no-store');
    });
    await t.test('drafts are never public through slug, ID guessing, lists, report targets or manuscript search', async () => {
      for (const user of [null, 'bob', 'moderator', 'alice']) assert.equal((await request('/api/articles/' + slug, { user })).status, 404);
      assert.equal((await request('/api/articles/' + id, { user: null })).status, 404);
      assert.equal((await request('/api/articles', { user: null })).body.data.pagination.total, 0);
      assert.equal((await request('/api/articles/mine', { user: 'bob' })).body.data.pagination.total, 0);
      assert.equal((await request('/api/articles/mine', { user: null })).status, 401);
      for (const target of [id, 'invalid', String(new mongoose.Types.ObjectId())]) assert.equal((await request('/api/articles/mine/' + target, { user: 'bob' })).status, 404);
      assert.equal((await post('/api/reports', { targetType: 'article', targetId: id, reason: 'other' }, 'bob')).status, 404);
      assert.equal((await request('/api/search?q=EssayOnlyNeedle', { user: null })).body.data.length, 0);
    });
    await t.test('only owned drafts are editable and revision conflicts prevent lost edits', async () => {
      const edit = (body, user = 'alice', target = id) => request('/api/articles/' + target, { method: 'PATCH', body, user });
      assert.equal((await edit({ expectedRevision: 0, subtitle: 'A revised subtitle' }, 'bob')).status, 404);
      for (const key of ['author', 'status', 'slug', 'publishedAt', 'revision', 'createdAt', 'reviewReason', '$set']) assert.equal((await edit({ expectedRevision: 0, [key]: 'spoof' })).status, 400);
      const results = await Promise.all([edit({ expectedRevision: 0, subtitle: 'One update' }), edit({ expectedRevision: 0, subtitle: 'Another update' })]);
      assert.deepEqual(results.map(value => value.status).sort(), [200, 409]); assert.equal((await own(id)).revision, 1);
      assert.equal((await edit({ expectedRevision: 0, body: 'Stale' })).status, 409);
    });
    await t.test('submission freezes edits; only a separately authorized peer can approve', async () => {
      assert.equal((await submit(id)).status, 200);
      assert.equal((await own(id)).status, 'pending_review');
      assert.equal((await request('/api/articles/' + id, { method: 'PATCH', body: { expectedRevision: 2, title: 'No pending edit' } })).status, 409);
      assert.equal((await post(`/api/articles/${id}/review`, { action: 'approve', expectedRevision: 2, reason: 'Self approval' })).status, 403);
      assert.equal((await request('/api/articles/moderation')).status, 403);
      assert.equal((await request('/api/articles/moderation', { user: 'moderator' })).body.data.items[0].id, id);
      const result = await review(id, 'approve'); assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.data.item.status, 'published'); assert.ok(Date.parse(result.body.data.item.publishedAt));
      assert.equal(await Publication.countDocuments({ article: id }), 1); assert.equal(await Audit.countDocuments({ targetType: 'article', targetId: id, action: 'approve' }), 1);
      const ownModerator = await draft({}, 'moderator'); assert.equal(ownModerator.status, 201);
      assert.equal((await submit(ownModerator.body.data.item.id, 'moderator')).status, 200);
      assert.equal((await review(ownModerator.body.data.item.id, 'approve')).status, 403);
    });
    await t.test('published discovery has bounded tag/category pagination and excludes private management fields', async () => {
      const detail = await request('/api/articles/' + slug, { user: null }); assert.equal(detail.status, 200);
      assert.equal(detail.body.data.item.reviewReason, undefined); assert.equal(detail.body.data.item.author.email, undefined);
      const list = await request('/api/articles?tag=reflection&category=essay&limit=1', { user: null });
      assert.equal(list.body.data.pagination.total, 1); assert.equal(list.body.data.items[0].body, undefined);
      assert.equal((await request('/api/articles?tag=unknown', { user: null })).body.data.items.length, 0);
      for (const query of ['limit=51', 'page=01', 'status=draft', 'author=x', 'tag[$ne]=x', 'limit=1&limit=2', 'category=unknown']) assert.equal((await request('/api/articles?' + query)).status, 400, query);
      assert.equal((await request('/api/articles/' + slug, { user: 'forged' })).status, 401);
      assert.equal((await request('/api/articles/' + id, { method: 'PATCH', body: { expectedRevision: 3, body: 'Live rewrite' } })).status, 409);
      assert.equal((await request('/api/articles/' + id, { method: 'DELETE', body: {} })).status, 409);
    });
    await t.test('article reports reuse deduplication, moderator-only queues and existing audit history', async () => {
      const body = { targetType: 'article', targetId: id, reason: 'other', details: 'Article report details' };
      const result = await post('/api/reports', body, 'bob'); assert.equal(result.status, 201); reportId = result.body.data.id;
      assert.equal((await post('/api/reports', body, 'bob')).body.data.id, reportId);
      assert.equal(await Report.countDocuments({ targetId: id, reporter: users.bob._id }), 1);
      assert.equal((await request('/api/moderation/reports', { user: 'bob' })).status, 403);
      const queue = await request('/api/moderation/reports', { user: 'moderator' }); assert.equal(queue.body.data.items[0].targetType, 'article');
      assert.equal(queue.body.data.items[0].context.articleSlug, slug); assert.equal(queue.body.data.items[0].reporter, undefined);
      assert.equal((await request(`/api/moderation/audit?targetType=article&targetId=${id}`, { user: 'moderator' })).body.data.items[0].action, 'approve');
      assert.equal((await post('/api/moderation/actions', { targetType: 'article', targetId: id, action: 'hide', reason: 'Use reviewed revisions' }, 'moderator')).status, 400);
    });
    await t.test('unpublication hides immediately; rejection preserves reasons and snapshots survive revisions', async () => {
      assert.equal((await review(id, 'unpublish')).status, 200);
      assert.equal((await request('/api/articles/' + slug, { user: null })).status, 404);
      assert.equal((await request('/api/articles', { user: null })).body.data.pagination.total, 0);
      const previous = (await Publication.findOne({ article: id }).lean()).content.body;
      let row = await own(id);
      assert.equal((await request('/api/articles/' + id, { method: 'PATCH', body: { expectedRevision: row.revision, body: 'New argument requires review.' } })).status, 200);
      assert.equal((await submit(id)).status, 200); assert.equal((await review(id, 'reject')).status, 200);
      row = await own(id); assert.equal(row.status, 'rejected'); assert.equal(row.reviewReason, 'Synthetic review reason');
      assert.equal((await request('/api/articles/' + id, { method: 'PATCH', body: { expectedRevision: row.revision, subtitle: 'Addressing the review' } })).status, 200);
      assert.equal((await submit(id)).status, 200); assert.equal((await review(id, 'approve')).status, 200);
      const history = await request(`/api/articles/mine/${id}/publications?limit=1`); assert.equal(history.body.data.pagination.total, 2);
      assert.equal(history.body.data.items[0].content.body, 'New argument requires review.');
      assert.equal((await request(`/api/articles/mine/${id}/publications?page=2&limit=1`)).body.data.items[0].content.body, previous);
      assert.equal((await request(`/api/articles/mine/${id}/publications`, { user: 'bob' })).status, 404);
      assert.equal((await own(id)).slug, slug);
    });
    await t.test('archive preserves authorship and history, and withdrawn submissions cannot be approved', async () => {
      const created = await draft({}, 'bob'), target = created.body.data.item.id;
      assert.equal((await submit(target, 'bob')).status, 200);
      assert.equal((await request('/api/articles/' + target, { method: 'DELETE', body: {} })).status, 404);
      assert.equal((await request('/api/articles/' + target, { method: 'DELETE', body: {}, user: 'bob' })).status, 200);
      assert.equal((await review(target, 'approve')).status, 409);
      assert.equal((await Article.findById(target)).status, 'archived'); assert.equal(String((await Article.findById(target)).author), String(users.bob._id));
    });
    await t.test('real unique indexes and bounded retries handle slug collisions without altering prior articles', async () => {
      const original = slugs.makeSlug; let attempts = 0;
      try {
        slugs.makeSlug = title => ++attempts === 1 ? slug : original(title);
        const result = await draft({}, 'bob'); assert.equal(result.status, 201); assert.notEqual(result.body.data.item.slug, slug); assert.equal(attempts, 2);
        slugs.makeSlug = () => slug; assert.equal((await draft({}, 'bob')).status, 503);
      } finally { slugs.makeSlug = original; }
      await assert.rejects(Article.collection.insertOne({ slug }), error => error.code === 11000);
      assert.equal(await Article.countDocuments({ slug }), 1);
    });
    await t.test('bounds, tag/category enums, image URLs and canonical references reject malformed input', async () => {
      const cases = [{ title: ' ' }, { body: 'x'.repeat(100001) }, { tags: ['same', ' SAME '] }, { tags: ['<script>'] }, { tags: Array(9).fill('tag') },
        { category: 'arbitrary' }, { coverImage: 'javascript:alert(1)' }, { coverImage: 'https://images.example.test/unsafe.svg' }, { coverImage: 'https://unapproved.test/a.png' },
        { canonicalReferences: [{ bookId: 'unknown' }] }, { canonicalReferences: [{ bookId: 'freedom', chapterNumber: '10' }] },
        { canonicalReferences: [{ bookId: 'freedom', chapterNumber: 1, verseId: 'freedom:10:14' }] }, { canonicalReferences: [{ bookId: 'freedom', extra: 'denied' }] },
        { status: 'published' }, { author: String(users.bob._id) }];
      // Use editing to exercise validation without consuming the creation quota.
      const target = (await draft({}, 'bob')).body.data.item;
      for (const extra of cases) assert.equal((await request('/api/articles/' + target.id, { method: 'PATCH', user: 'bob', body: { expectedRevision: 0, ...extra } })).status, 400, JSON.stringify(extra).slice(0, 120));
      await assert.rejects(new Article({ author: users.alice._id, slug: 'test', title: 'Test', body: 'Body', status: 'arbitrary' }).validate(), /status/);
      await assert.rejects(new Article({ author: users.alice._id, slug: 'test', title: 'Test', body: 'Body', canonicalReferences: [{ bookId: 'unknown' }] }).validate(), /canonicalReferences/);
    });
    await t.test('publication snapshots and content roll back when audit storage fails', async () => {
      const created = await draft({}, 'bob'), target = created.body.data.item.id; assert.equal((await submit(target, 'bob')).status, 200);
      const stored = await Article.findById(target).lean();
      await new Publication({ article: target, author: users.bob._id, approvedBy: users.moderator._id, revision: 2, slug: stored.slug,
        publishedAt: new Date(), reason: 'Valid snapshot fixture', content: Object.fromEntries(Object.keys(require('../src/models/articleContent').contentFields).map(key => [key, stored[key]])) }).validate();
      const original = Audit.create;
      try { Audit.create = async () => { throw new Error('Synthetic audit failure'); }; assert.equal((await review(target, 'approve')).status, 500); }
      finally { Audit.create = original; }
      assert.equal((await Article.findById(target)).status, 'pending_review'); assert.equal(await Publication.countDocuments({ article: target }), 0);
    });
    await t.test('creation, submission and report limits follow accounts across client IP changes', async () => {
      const ids = [];
      for (let i = 0; i < 10; i++) { const result = await draft({}, 'limited'); assert.equal(result.status, 201); ids.push(result.body.data.item.id); }
      assert.equal((await draft({}, 'limited')).status, 429);
      for (const target of ids) assert.equal((await submit(target, 'limited')).status, 200);
      assert.equal((await post(`/api/articles/${ids[0]}/submit`, { expectedRevision: 1 }, 'limited')).status, 429);
      for (let i = 0; i < 10; i++) assert.equal((await post('/api/reports', { targetType: 'article', targetId: id, reason: 'spam' }, 'limited')).status, 201);
      assert.equal((await post('/api/reports', { targetType: 'article', targetId: id, reason: 'spam' }, 'limited')).status, 429);
    });
    await t.test('posting gates, moderator revocation, inactive accounts and missing indexes fail closed', async () => {
      delete process.env.COMMUNITY_POSTING_ENABLED; assert.equal((await draft()).status, 503);
      assert.equal((await review(id, 'unpublish')).status, 200);
      process.env.COMMUNITY_POSTING_ENABLED = 'true';
      await Moderator.updateOne({ user: users.moderator._id }, { revokedAt: new Date() }); assert.equal((await request('/api/articles/moderation', { user: 'moderator' })).status, 403);
      await Moderator.updateOne({ user: users.moderator._id }, { $unset: { revokedAt: '' } });
      await User.updateOne({ _id: users.unverified._id }, { isActive: false }); assert.equal((await draft({}, 'unverified')).status, 401);
      await Article.collection.dropIndex('article_slug_unique'); await assert.rejects(assertArticleStorage(), { status: 503 });
      assert.equal((await request('/api/articles', { user: null })).status, 503); await Article.createIndexes();
    });
    await t.test('article operations preserve the PDF corpus, canonical API and manuscript-only search', async () => {
      assert.deepEqual((await request('/api/verses/freedom:10:14', { user: null })).body, publicBefore.body); assert.equal(canonicalHash(), before);
      for (const q of ['EssayOnlyNeedle', 'New argument requires review', 'Article report details']) assert.equal((await request('/api/search?q=' + encodeURIComponent(q), { user: null })).body.data.length, 0);
      assert.equal((await request('/api/books', { user: null })).status, 200);
    });
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await memory.stop(); }
});
