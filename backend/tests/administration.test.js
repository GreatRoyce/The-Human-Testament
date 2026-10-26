const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const mongoose = require('mongoose'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.NODE_ENV = 'production'; process.env.AUTH_ENABLED = 'true'; process.env.ADMINISTRATION_ENABLED = 'true'; process.env.CONTENT_SOURCE = 'pdf';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url'); process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test';
process.env.COMMUNITY_POSTING_ENABLED = 'true'; process.env.ANALYTICS_ENABLED = 'true'; process.env.ANALYTICS_ALLOWED_ORIGINS = process.env.AUTH_ALLOWED_ORIGINS;
process.env.MAIL_DELIVERY_ENABLED = 'false'; delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
const app = require('../src/app'), User = require('../src/models/User'), Grant = require('../src/models/AnalyticsGrant'), Audit = require('../src/models/ModerationAction');
const Moderator = require('../src/models/CommunityModerator'), Discussion = require('../src/models/Discussion'), Comment = require('../src/models/Comment'), Report = require('../src/models/ContentReport');
const Circle = require('../src/models/ReadingCircle'), Membership = require('../src/models/CircleMembership'), Article = require('../src/models/Article'), Publication = require('../src/models/ArticlePublication');
const Session = require('../src/models/RefreshSession'), Reset = require('../src/models/PasswordResetToken'), Verification = require('../src/models/EmailVerificationToken');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { initializeCommunityStorage } = require('../src/services/communityStorage');
const { initializeArticleStorage } = require('../src/services/articleStorage');
const { initializeAnalyticsStorage } = require('../src/services/analyticsStorage');
const { initializeAdministrationStorage } = require('../src/services/administrationStorage');
const { createSession } = require('../src/services/session.service');
const { getAuthConfig } = require('../src/config/auth');
const { provision } = require('../src/services/administrationAccess');
const service = require('../src/services/administration.service');
const canonicalHash = () => createHash('sha256').update(readFileSync(require.resolve('../../shared/manuscript.json'))).digest('hex');
test('administration reuses explicit permissions, account lifecycle and append-only moderation history', { timeout: 1800000 }, async t => {
  const before = canonicalHash(), memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } }); let server;
  try {
    assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
    await mongoose.connect(memory.getUri(), { dbName: 'administration_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage(); await initializeCommunityStorage(); await initializeArticleStorage(); await initializeAdministrationStorage();
    await require('../src/services/analyticsStorage').assertAnalyticsGrantStorage();
    assert.equal((await mongoose.connection.db.listCollections({ name: 'analyticsevents' }).toArray()).length, 0, 'Administration initialization must not require or initialize traffic storage.');
    await initializeAnalyticsStorage();
    const users = {}, tokens = {}, auth = {}, passwordHash = await bcrypt.hash('Synthetic administration passphrase!', 12);
    for (const name of ['chief', 'deputy', 'analyticsOnly', 'owner', 'moderatorOnly', 'reader', 'author', 'inactive', 'unverified']) {
      users[name] = await User.create({ email: `${name.toLowerCase()}@example.test`, displayName: name, passwordHash, emailVerified: name !== 'unverified' });
      tokens[name] = (await createSession(await User.findById(users[name]._id).select('+passwordHash'), getAuthConfig())).accessToken;
      auth[name] = { user: users[name], sessionId: new mongoose.Types.ObjectId(jwt.decode(tokens[name]).sid) };
    }
    await User.updateOne({ _id: users.inactive._id }, { $set: { isActive: false } });
    for (const name of ['chief', 'deputy', 'analyticsOnly', 'unverified']) await Grant.create({ user: users[name]._id, role: 'admin', grantedBy: 'test', reason: 'Disposable fixture' });
    await Grant.create({ user: users.owner._id, role: 'owner', grantedBy: 'test', reason: 'Analytics only' });
    for (const name of ['chief', 'moderatorOnly']) await Moderator.create({ user: users[name]._id, grantedBy: 'test', reason: 'Existing moderation permission' });
    const provisionFor = (action, name) => provision({ action, userId: String(users[name]._id), actorId: String(users.chief._id), operator: 'synthetic-operator', reason: 'Explicit test permission decision' });
    await provisionFor('grant', 'chief'); await provisionFor('grant', 'deputy');
    app.set('trust proxy', 1); let sequence = 0;
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    async function request(path, { method = 'GET', body, user = 'chief', headers = {} } = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, signal: AbortSignal.timeout(20000), headers: {
        Origin: process.env.AUTH_ALLOWED_ORIGINS, 'Content-Type': 'application/json', 'X-CSRF-Protection': '1',
        'X-Forwarded-For': `198.20.${Math.floor(++sequence / 250)}.${sequence % 250 + 1}`,
        ...(user ? { Authorization: 'Bearer ' + (tokens[user] ?? user) } : {}), ...headers,
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
    }
    const post = (path, body, user = 'chief') => request(path, { method: 'POST', body, user });
    const status = (name, isActive, expectedIsActive, user = 'chief', extra = {}) => request(`/api/admin/users/${users[name]._id}/status`, { method: 'PATCH', body: { isActive, expectedIsActive, reason: 'Reviewed account decision', ...extra }, user });
    await t.test('Admin permission is explicit, existing analytics owners/admins and moderators are not promoted', async () => {
      for (const path of ['/api/admin/capabilities', '/api/admin/overview', '/api/admin/users', '/api/admin/audit']) {
        assert.equal((await request(path)).status, 200, path);
        for (const user of [null, 'invalid-token', 'reader', 'analyticsOnly', 'owner', 'moderatorOnly', 'unverified', 'inactive']) assert.equal((await request(path, { user })).status, [null, 'invalid-token', 'inactive'].includes(user) ? 401 : 403, path + ' ' + user);
      }
      assert.deepEqual((await request('/api/admin/capabilities')).body.data, { administration: true, globalModerator: true, roleManagement: false, analyticsConfigured: true });
      assert.equal((await request('/api/admin/capabilities', { user: 'deputy' })).body.data.globalModerator, false);
      const claims = jwt.decode(tokens.reader); delete claims.iat; delete claims.exp;
      const forged = jwt.sign({ ...claims, role: 'admin', administration: true }, process.env.AUTH_ACCESS_TOKEN_SECRET, { expiresIn: 900 });
      assert.equal((await request('/api/admin/users', { user: forged })).status, 403);
      await assert.rejects(Grant.create({ user: users.reader._id, role: 'owner', administration: true, grantedBy: 'test', reason: 'No owner elevation' }), error => error.name === 'ValidationError');
      await assert.rejects(provisionFor('grant', 'unverified'), { status: 403 });
      assert.equal(await Audit.countDocuments({ targetType: 'admin_permission', action: 'grant_admin', source: 'operator' }), 2);
    });
    await t.test('users are projected, searchable with literal text, bounded, filtered and never contain credentials', async () => {
      const all = await request('/api/admin/users?limit=2'); assert.equal(all.status, 200); assert.equal(all.body.data.items.length, 2); assert.equal(all.body.data.pagination.total, 9);
      const second = await request('/api/admin/users?page=2&limit=2'); assert.notEqual(all.body.data.items[0].id, second.body.data.items[0].id);
      assert.equal((await request('/api/admin/users?role=administrator')).body.data.pagination.total, 2);
      assert.equal((await request('/api/admin/users?role=moderator')).body.data.pagination.total, 2);
      assert.equal((await request('/api/admin/users?role=owner')).body.data.pagination.total, 1);
      assert.equal((await request('/api/admin/users?status=deactivated')).body.data.pagination.total, 1);
      assert.equal((await request('/api/admin/users?q=CHIEF%40example.test')).body.data.pagination.total, 1);
      assert.equal((await request('/api/admin/users?q=%2E%2A')).body.data.pagination.total, 0); assert.equal((await request('/api/admin/users?q=%5B')).status, 200);
      const detail = await request('/api/admin/users/' + users.reader._id); assert.equal(detail.body.data.item.email, users.reader.email);
      for (const secret of ['passwordHash', 'tokenHash', 'passwordChangedAt', 'sessionId', '__v', 'grantedBy']) assert.equal(JSON.stringify(detail.body).includes(secret), false);
      assert.equal(detail.headers.get('cache-control'), 'no-store'); assert.equal((await request('/api/admin/users/not-an-id')).status, 404);
      for (const query of ['limit=0', 'limit=51', 'page=01', 'page=10001', 'role=superuser', 'status=blocked', 'q=', 'q=x&q=y', 'email[$ne]=x', 'limit=1&limit=2', 'start=2026-02-30&end=2026-03-01', 'start=2026-01-01', 'start=2099-01-01&end=2099-01-02']) assert.equal((await request('/api/admin/users?' + query)).status, 400, query);
    });
    await t.test('status changes require reasons, current-state confirmation, trusted origins and explicit permission', async () => {
      assert.equal((await status('reader', false, true, 'reader')).status, 403);
      assert.equal((await status('reader', false, true, 'chief', { reason: ' ' })).status, 400);
      for (const extra of [{ role: 'admin' }, { administration: true }, { passwordHash: 'plaintext' }, { user: String(users.chief._id) }]) assert.equal((await status('reader', false, true, 'chief', extra)).status, 400);
      assert.equal((await status('chief', false, true)).status, 403);
      assert.equal((await status('reader', false, false)).status, 409);
      for (const headers of [{ Origin: 'https://attacker.test' }, { 'X-CSRF-Protection': '0' }]) assert.equal((await request(`/api/admin/users/${users.reader._id}/status`, { method: 'PATCH', body: { isActive: false, expectedIsActive: true, reason: 'Reason' }, headers })).status, 403);
      assert.equal((await request(`/api/admin/users/${users.reader._id}/role`, { method: 'PATCH', body: { role: 'admin' } })).status, 404);
      assert.equal((await post('/api/admin/permissions', { user: String(users.reader._id), administration: true })).status, 404);
      assert.equal((await User.findById(users.reader._id)).role, 'user');
    });
    await t.test('deactivation revokes sessions/recovery credentials atomically and reactivation cannot revive them', async () => {
      for (const Model of [Reset, Verification]) await Model.create({ user: users.reader._id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 600000), deliveryStatus: 'accepted' });
      assert.equal((await status('reader', false, true)).status, 200); assert.equal((await User.findById(users.reader._id)).isActive, false);
      assert.equal(await Session.countDocuments({ user: users.reader._id, revokedAt: null }), 0);
      for (const Model of [Reset, Verification]) assert.equal(await Model.countDocuments({ user: users.reader._id, invalidatedAt: null }), 0);
      assert.equal((await request('/api/auth/me', { user: 'reader' })).status, 401);
      const count = await Audit.countDocuments({ targetType: 'user', targetId: users.reader._id });
      assert.equal((await status('reader', false, false)).status, 200); assert.equal(await Audit.countDocuments({ targetType: 'user', targetId: users.reader._id }), count);
      assert.equal((await status('reader', true, false)).status, 200); assert.equal((await request('/api/auth/me', { user: 'reader' })).status, 401);
      const history = await request(`/api/admin/audit?targetType=user&targetId=${users.reader._id}`); assert.deepEqual(history.body.data.items.map(row => row.action).sort(), ['activate', 'deactivate']);
      tokens.reader = (await createSession(await User.findById(users.reader._id).select('+passwordHash'), getAuthConfig())).accessToken;
    });
    await t.test('audit failure rolls back account changes and credential revocation', async () => {
      const original = Audit.create;
      try { Audit.create = async () => { throw new Error('Synthetic audit failure'); }; assert.equal((await status('reader', false, true)).status, 500); }
      finally { Audit.create = original; }
      assert.equal((await User.findById(users.reader._id)).isActive, true); assert.equal((await request('/api/auth/me', { user: 'reader' })).status, 200);
    });
    let article, discussion, comment, report;
    await t.test('article workflow still requires an independent moderator, reviewed revision and non-author decision', async () => {
      article = (await post('/api/articles', { title: 'Synthetic review article', body: 'Reader interpretation' }, 'author')).body.data.item;
      article = (await post(`/api/articles/${article.id}/submit`, { expectedRevision: article.revision }, 'author')).body.data.item;
      assert.equal((await request('/api/articles/moderation', { user: 'deputy' })).status, 403);
      assert.equal((await post(`/api/articles/${article.id}/review`, { action: 'approve', reason: 'No moderator permission', expectedRevision: article.revision }, 'deputy')).status, 403);
      assert.equal((await post(`/api/articles/${article.id}/review`, { action: 'approve', reason: 'Stale', expectedRevision: article.revision - 1 })).status, 409);
      let result = await post(`/api/articles/${article.id}/review`, { action: 'reject', reason: 'Needs revision', expectedRevision: article.revision }); assert.equal(result.status, 200); article = result.body.data.item;
      article = (await post(`/api/articles/${article.id}/submit`, { expectedRevision: article.revision }, 'author')).body.data.item;
      result = await post(`/api/articles/${article.id}/review`, { action: 'approve', reason: 'Reviewed for publication', expectedRevision: article.revision }); assert.equal(result.status, 200); article = result.body.data.item;
      assert.equal(await Publication.countDocuments({ article: article.id }), 1);
      assert.equal((await request('/api/articles/' + article.slug, { user: null })).status, 200);
      result = await post(`/api/articles/${article.id}/review`, { action: 'unpublish', reason: 'Publication correction needed', expectedRevision: article.revision }); assert.equal(result.status, 200); article = result.body.data.item;
      const own = (await post('/api/articles', { title: 'Chief authored', body: 'Self decision test' })).body.data.item;
      const submitted = (await post(`/api/articles/${own.id}/submit`, { expectedRevision: own.revision })).body.data.item;
      assert.equal((await post(`/api/articles/${own.id}/review`, { action: 'approve', reason: 'Self approval', expectedRevision: submitted.revision })).status, 403);
      const history = await request(`/api/admin/audit?targetType=article&targetId=${article.id}`); assert.equal(history.body.data.pagination.total, 3);
    });
    await t.test('reports reuse existing context, filters, actions, notifications and terminal resolution', async () => {
      discussion = (await post('/api/discussions', { title: 'Reported discussion', body: 'Discussion context' }, 'author')).body.data.item;
      comment = (await post(`/api/discussions/${discussion.id}/comments`, { body: 'Reported comment context' }, 'reader')).body.data.item;
      report = (await post('/api/reports', { targetType: 'comment', targetId: comment.id, reason: 'spam', details: 'Synthetic report details' }, 'author')).body.data;
      const today = new Date().toISOString().slice(0, 10);
      const queue = await request(`/api/moderation/reports?status=open&targetType=comment&reason=spam&start=${today}&end=${today}`); assert.equal(queue.status, 200); assert.equal(queue.body.data.pagination.total, 1); assert.equal(queue.body.data.items[0].context.body, 'Reported comment context');
      assert.equal((await request('/api/moderation/reports?reason=invalid')).status, 400); assert.equal((await request('/api/moderation/reports?targetType=book')).status, 400);
      assert.equal((await post('/api/moderation/actions', { targetType: 'comment', targetId: comment.id, action: 'delete', reason: 'Removal after review' })).status, 200);
      assert.equal((await Comment.findById(comment.id)).status, 'deleted');
      assert.equal((await request(`/api/moderation/reports/${report.id}`, { method: 'PATCH', body: { status: 'resolved', reason: 'Resolved after removal' } })).status, 200);
      assert.equal((await request(`/api/moderation/reports/${report.id}`, { method: 'PATCH', body: { status: 'resolved', reason: 'Idempotent' } })).status, 200);
      assert.equal(await Audit.countDocuments({ targetType: 'report', targetId: report.id, action: 'resolve' }), 1);
      assert.equal((await request(`/api/moderation/reports/${report.id}`, { method: 'PATCH', body: { status: 'reviewed', reason: 'Cannot reopen' } })).status, 409);
      assert.equal((await request('/api/moderation/reports', { user: 'deputy' })).status, 403);
      const dismissed = (await post('/api/reports', { targetType: 'discussion', targetId: discussion.id, reason: 'other' }, 'reader')).body.data;
      assert.equal((await request(`/api/moderation/reports/${dismissed.id}`, { method: 'PATCH', body: { status: 'resolved', reason: 'Dismissed after review; content complies with policy.' } })).status, 200);
      assert.equal((await Discussion.findById(discussion.id)).status, 'active');
      assert.match((await Audit.findOne({ targetType: 'report', targetId: dismissed.id }).lean()).reason, /^Dismissed after review/);
    });
    await t.test('private-circle material and audit history remain invisible without active circle access', async () => {
      const circle = await Circle.create({ owner: users.author._id, name: 'Private circle', visibility: 'private', membershipPolicy: 'invitation' });
      const row = await Discussion.create({ author: users.author._id, title: 'Private discussion', body: 'PrivateBodySentinel', visibility: 'circle', circle: circle._id });
      const privateReport = await Report.create({ reporter: users.reader._id, targetType: 'discussion', targetId: row._id, circle: circle._id, reason: 'other', details: 'PrivateReportSentinel' });
      await Audit.create({ moderator: users.moderatorOnly._id, targetType: 'discussion', targetId: row._id, action: 'hide', reason: 'PrivateReasonSentinel', previousStatus: 'active', resultingStatus: 'hidden' });
      const privateComment = await Comment.create({ discussion: row._id, author: users.author._id, body: 'Private comment' });
      for (const [targetType, targetId] of [['comment', privateComment._id], ['report', privateReport._id]]) await Audit.create({ moderator: users.moderatorOnly._id, targetType, targetId, action: 'review', reason: 'PrivateReasonSentinel:' + targetType, previousStatus: 'active', resultingStatus: 'reviewed' });
      const history = await request('/api/admin/audit'); assert.equal(JSON.stringify(history.body).includes('PrivateReasonSentinel'), false);
      assert.equal((await request(`/api/admin/audit?targetId=${row._id}`)).body.data.pagination.total, 0);
      for (const targetId of [privateComment._id, privateReport._id]) assert.equal((await request(`/api/admin/audit?targetId=${targetId}`)).body.data.pagination.total, 0);
      assert.equal(JSON.stringify((await request('/api/moderation/reports')).body).includes('PrivateReportSentinel'), false);
      assert.equal((await post('/api/moderation/actions', { targetType: 'discussion', targetId: row._id, action: 'hide', reason: 'No membership' })).status, 404);
      assert.equal((await request(`/api/moderation/reports/${privateReport._id}`, { method: 'PATCH', body: { status: 'resolved', reason: 'No membership' } })).status, 404);
      const member = await Membership.create({ circle: circle._id, user: users.chief._id, role: 'member', status: 'active' });
      assert.equal((await request(`/api/admin/audit?targetId=${row._id}`)).body.data.pagination.total, 1);
      for (const targetId of [privateComment._id, privateReport._id]) assert.equal((await request(`/api/admin/audit?targetId=${targetId}`)).body.data.pagination.total, 1);
      member.status = 'removed'; await member.save();
      for (const targetId of [row._id, privateComment._id, privateReport._id]) assert.equal((await request(`/api/admin/audit?targetId=${targetId}`)).body.data.pagination.total, 0);
    });
    await t.test('audit history rejects ORM mutation, replacement, bulk writes, deletion and HTTP rewrite attempts', async () => {
      const row = await Audit.findOne({ targetType: 'user' }), original = row.reason; row.reason = 'Rewritten'; await assert.rejects(row.save(), /append-only/);
      for (const work of [() => Audit.updateOne({ _id: row._id }, { $set: { reason: 'Changed' } }), () => Audit.updateMany({}, { $set: { previousStatus: 'changed' } }),
        () => Audit.findOneAndUpdate({ _id: row._id }, { reason: 'Changed' }), () => Audit.replaceOne({ _id: row._id }, { reason: 'Changed' }),
        () => Audit.deleteOne({ _id: row._id }), () => Audit.deleteMany({}), () => Audit.findOneAndDelete({ _id: row._id }), () => row.deleteOne(),
        () => Audit.bulkWrite([{ deleteOne: { filter: { _id: row._id } } }])]) await assert.rejects(work, /append-only/);
      assert.equal((await Audit.findById(row._id)).reason, original);
      assert.equal((await request('/api/admin/audit/' + row._id, { method: 'DELETE', body: {} })).status, 404);
      for (const query of ['targetType=book', 'action=import', 'targetId=bad', 'page=0', 'limit=51', 'start=2026-02-30&end=2026-03-01']) assert.equal((await request('/api/admin/audit?' + query)).status, query.includes('targetId=') ? 404 : 400);
      assert.equal((await request('/api/admin/audit?targetType=article', { user: 'deputy' })).status, 403);
    });
    await t.test('overview distinguishes live counts, absent queues and optional analytics failures', async () => {
      let result = (await request('/api/admin/overview')).body.data;
      assert.equal(result.users.total, 9); assert.equal(result.users.active, 8); assert.equal(result.users.deactivated, 1); assert.equal(result.users.recent, 9);
      assert.equal(result.articles.available, true); assert.equal(result.reports.available, true); assert.equal(result.communityQueue.available, false);
      assert.equal(result.analytics.available, true); assert.equal(result.analytics.data.metrics.pageViews.current, 0); assert.equal(result.analytics.data.coverage.empty, true);
      process.env.ANALYTICS_ENABLED = 'false'; result = (await request('/api/admin/overview')).body.data; assert.equal(result.analytics.available, false); process.env.ANALYTICS_ENABLED = 'true';
      const deputy = (await request('/api/admin/overview', { user: 'deputy' })).body.data; assert.equal(deputy.articles.available, false); assert.equal(deputy.reports.available, false);
      await Publication.collection.dropIndex('article_publication_revision_unique'); result = (await request('/api/admin/overview')).body.data; assert.equal(result.articles.available, false); await Publication.createIndexes();
    });
    await t.test('concurrent opposing deactivations preserve an active administrator, and final permission cannot be revoked', async () => {
      const reason = 'Concurrent account restriction', input = { isActive: false, expectedIsActive: true, reason };
      const outcomes = await Promise.allSettled([service.changeAccount(auth.chief, String(users.deputy._id), input), service.changeAccount(auth.deputy, String(users.chief._id), input)]);
      assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
      const active = await User.find({ _id: { $in: [users.chief._id, users.deputy._id] }, isActive: true }); assert.equal(active.length, 1);
      const survivor = active[0];
      await assert.rejects(provision({ action: 'revoke', userId: String(survivor._id), actorId: String(survivor._id), operator: 'test', reason: 'Last administrator' }), { status: 409 });
      assert.equal((await Grant.findOne({ user: survivor._id, role: 'admin' })).administration, true);
      // Restore the disposable fixture through the surviving administrator, then test live permission revocation.
      const survivorName = String(survivor._id) === String(users.chief._id) ? 'chief' : 'deputy', otherName = survivorName === 'chief' ? 'deputy' : 'chief';
      assert.equal((await status(otherName, true, false, survivorName)).status, 200);
      tokens[otherName] = (await createSession(await User.findById(users[otherName]._id).select('+passwordHash'), getAuthConfig())).accessToken;
      await provision({ action: 'revoke', userId: String(users[otherName]._id), actorId: String(survivor._id), operator: 'test', reason: 'Revoke one permission' });
      assert.equal((await request('/api/admin/users', { user: otherName })).status, 403);
      assert.equal(await Audit.countDocuments({ action: 'revoke_admin', targetId: users[otherName]._id }), 1);
    });
    await t.test('administration outage, limits and malicious targets never modify the canonical manuscript', async () => {
      const survivor = await Grant.findOne({ role: 'admin', administration: true, revokedAt: null }).lean(); const name = Object.keys(users).find(key => String(users[key]._id) === String(survivor.user));
      assert.equal((await post('/api/moderation/actions', { targetType: 'verse', targetId: String(users.reader._id), action: 'delete', reason: 'Denied canonical mutation' }, 'moderatorOnly')).status, 400);
      assert.equal((await request('/api/admin/audit?targetType=verse', { user: name })).status, 400);
      process.env.ADMINISTRATION_ENABLED = 'false'; assert.equal((await request('/api/admin/overview', { user: name })).status, 503); process.env.ADMINISTRATION_ENABLED = 'true';
      await Audit.collection.dropIndex('moderation_recent'); assert.equal((await request('/api/admin/overview', { user: name })).status, 503); await Audit.createIndexes();
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/books`); assert.equal(response.status, 200); assert.equal(canonicalHash(), before);
      let last; for (let i = 0; i < 121; i++) last = await request('/api/admin/capabilities', { user: name, headers: { 'X-Forwarded-For': '198.51.100.72' } }); assert.equal(last.status, 429);
    });
    for (const collection of ['books', 'chapters', 'verses', 'privatenotes', 'readinghistories', 'readingprogresses']) assert.equal(await mongoose.connection.collection(collection).countDocuments(), 0);
    assert.equal(canonicalHash(), before);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await memory.stop(); }
});
