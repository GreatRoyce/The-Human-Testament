const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.NODE_ENV = 'production'; process.env.AUTH_ENABLED = 'true'; process.env.CONTENT_SOURCE = 'pdf';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url'); process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test';
process.env.ANALYTICS_ENABLED = 'true'; process.env.ANALYTICS_ALLOWED_ORIGINS = 'https://reader.example.test'; process.env.ANALYTICS_RETENTION_DAYS = '180';
process.env.MAIL_DELIVERY_ENABLED = 'false'; delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
const app = require('../src/app'), User = require('../src/models/User'), Grant = require('../src/models/AnalyticsGrant');
const Event = require('../src/models/AnalyticsEvent'), State = require('../src/models/AnalyticsState'), Article = require('../src/models/Article');
const Moderator = require('../src/models/CommunityModerator'), Session = require('../src/models/RefreshSession');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { initializeAnalyticsStorage, assertAnalyticsStorage } = require('../src/services/analyticsStorage');
const { createSession } = require('../src/services/session.service');
const { getAuthConfig } = require('../src/config/auth');
const { analyticsConfig } = require('../src/config/analytics');
const service = require('../src/services/analytics.service');
const DAY = 86400000;
const canonicalHash = () => createHash('sha256').update(readFileSync(require.resolve('../../shared/manuscript.json'))).digest('hex');
const payload = extra => ({ eventId: randomUUID(), visitorId: randomUUID(), sessionId: randomUUID(), path: '/', referral: null, consent: true, ...extra });
test('analytics collection and reports preserve privacy, explicit permissions and manuscript independence', { timeout: 1800000 }, async t => {
  const before = canonicalHash(), memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  let server;
  try {
    assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
    await mongoose.connect(memory.getUri(), { dbName: 'analytics_test', autoIndex: false, autoCreate: false });
    await initializeAuthStorage(); await initializeAnalyticsStorage();
    const users = {}, auth = {}, tokens = {}, passwordHash = await bcrypt.hash('Synthetic analytics passphrase!', 12);
    for (const name of ['owner', 'admin', 'reader', 'moderator', 'inactive']) {
      users[name] = await User.create({ email: `${name}@example.test`, displayName: name, emailVerified: true, passwordHash });
      tokens[name] = (await createSession(await User.findById(users[name]._id).select('+passwordHash'), getAuthConfig())).accessToken;
      const claims = jwt.decode(tokens[name]); auth[name] = { user: users[name], sessionId: new mongoose.Types.ObjectId(claims.sid) };
    }
    await User.updateOne({ _id: users.inactive._id }, { $set: { isActive: false } });
    for (const role of ['owner', 'admin']) await Grant.create({ user: users[role]._id, role, grantedBy: 'synthetic-operator', reason: 'Disposable test only' });
    await Moderator.createCollection(); await Moderator.create({ user: users.moderator._id, grantedBy: 'synthetic-operator', reason: 'Not an analytics grant' });
    app.set('trust proxy', 1); let sequence = 0;
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    async function request(path, { method = 'GET', body, user, headers = {} } = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analytics${path}`, { method, signal: AbortSignal.timeout(20000), headers: {
        Origin: process.env.ANALYTICS_ALLOWED_ORIGINS, 'Content-Type': 'application/json', 'X-CSRF-Protection': '1', 'User-Agent': 'Synthetic browser',
        'X-Forwarded-For': `198.20.${Math.floor(++sequence / 250)}.${sequence % 250 + 1}`,
        ...(user ? { Authorization: 'Bearer ' + (tokens[user] ?? user) } : {}), ...headers,
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
    }
    const ingest = (body, options = {}) => request('/events', { method: 'POST', body, ...options });
    await t.test('anonymous collection normalizes server-derived metadata and hashes identifiers without storing credentials', async () => {
      const body = payload({ path: '/testament/freedom/1/1', referral: 'search.example.test' });
      const response = await ingest(body); assert.equal(response.status, 202, JSON.stringify(response.body)); assert.equal(response.body.data.accepted, true);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const row = await Event.collection.findOne({}); assert.equal(row.contentType, 'verse'); assert.equal(row.authenticated, false);
      for (const key of ['eventHash', 'visitorHash', 'sessionHash']) assert.match(row[key], /^[a-f0-9]{64}$/);
      for (const value of [body.eventId, body.visitorId, body.sessionId, '198.20', 'Synthetic browser', users.reader.email]) assert.equal(JSON.stringify(row).includes(value), false);
      for (const key of ['user', 'userId', 'ip', 'headers', 'password', 'token', 'query', 'device']) assert.equal(Object.hasOwn(row, key), false);
      const serial = JSON.stringify(await Event.findById(row._id).select('+visitorHash +sessionHash +eventHash')); assert.equal(serial.includes('Hash'), false);
      assert.ok(Math.abs(Date.now() - row.occurredAt.getTime()) < 10000); assert.equal(row.expiresAt - row.occurredAt, 180 * DAY);
      process.env.AUTH_ENABLED = 'false';
      try { assert.equal((await ingest(payload({ path: '/privacy' }))).status, 202, 'Anonymous collection must work without authentication enabled.'); }
      finally { process.env.AUTH_ENABLED = 'true'; }
    });
    await t.test('concurrent event replays count once; new navigations count separately', async () => {
      const body = payload(); const before = await Event.countDocuments();
      const responses = await Promise.all(Array.from({ length: 5 }, () => ingest(body)));
      assert.ok(responses.every(x => x.status === 202)); assert.equal(await Event.countDocuments(), before + 1);
      await ingest({ ...body, eventId: randomUUID() }); assert.equal(await Event.countDocuments(), before + 2);
    });
    await t.test('only actual public canonical paths and published articles are accepted', async () => {
      for (const path of ['/contact', '/testament', '/testament/materials', '/testament/freedom', '/testament/freedom/1', '/search', '/community/discussions', '/articles']) assert.equal((await ingest(payload({ path }))).status, 202, path);
      for (const path of ['/api/health', '/owner/analytics', '/admin/analytics', '/login', '/account/settings', '/reading/history', '/notifications', '/reset-password?token=secret', '/community/discussions/' + 'a'.repeat(24), '/community/reading-circles/' + 'a'.repeat(24), '/articles/mine', '/articles/write', '/articles/moderation', '/testament/missing', '/testament/freedom/999', '/testament/freedom/1/999', '/search?q=secret', '/#token=secret', '//attacker.test', '/testament/%66reedom', '/does-not-exist']) assert.equal((await ingest(payload({ path }))).status, 400, path);
      await Article.createCollection(); const article = await Article.create({ author: users.reader._id, slug: 'synthetic-public-essay', title: 'Synthetic', body: 'Disposable', status: 'draft' });
      assert.equal((await ingest(payload({ path: '/articles/' + article.slug }))).status, 400);
      await Article.updateOne({ _id: article._id }, { $set: { status: 'published' } });
      assert.equal((await ingest(payload({ path: '/articles/' + article.slug }))).status, 202);
      await Article.updateOne({ _id: article._id }, { $set: { status: 'archived' } });
      assert.equal((await ingest(payload({ path: '/articles/' + article.slug }))).status, 400);
    });
    await t.test('opt-out, DNT, GPC, bots and authenticated administrative traffic produce no event', async () => {
      const before = await Event.countDocuments();
      for (const headers of [{ DNT: '1' }, { 'Sec-GPC': '1' }, { 'User-Agent': 'Googlebot' }, { 'User-Agent': 'Uptime monitor' }, { 'User-Agent': 'HeadlessChrome' }]) assert.equal((await ingest(payload(), { headers })).body.data.accepted, false);
      assert.equal((await ingest(payload({ consent: false }))).body.data.accepted, false);
      for (const user of ['owner', 'admin']) assert.equal((await ingest(payload(), { user })).body.data.accepted, false);
      assert.equal(await Event.countDocuments(), before);
      assert.equal((await ingest(payload(), { user: 'reader' })).body.data.accepted, true);
      assert.equal((await Event.findOne({ authenticated: true })).authenticated, true);
      assert.equal((await ingest(payload(), { user: 'inactive' })).status, 401);
      assert.equal((await ingest(payload(), { user: 'invalid-token' })).status, 401);
    });
    await t.test('ingestion validates origin, payload size, privacy fields, query injection and referrer hostname', async () => {
      for (const extra of [{ userId: String(users.reader._id) }, { occurredAt: new Date().toISOString() }, { contentType: 'verse' }, { ip: '1.2.3.4' }, { password: 'secret' }, { eventId: 'invalid' }, { referral: 'https://example.test/private?token=secret' }, { referral: '127.0.0.1' }, { referral: 'localhost' }]) assert.equal((await ingest(payload(extra))).status, 400);
      assert.equal((await ingest(payload(), { headers: { Origin: 'https://attacker.test' } })).status, 403);
      assert.equal((await ingest(payload(), { headers: { 'X-CSRF-Protection': '0' } })).status, 403);
      assert.equal((await ingest(payload(), { headers: { 'Content-Type': 'text/plain' } })).status, 415);
      assert.equal((await ingest(payload({ path: 'x'.repeat(3000) }))).status, 413);
      assert.equal((await request('/events?visitor=secret', { method: 'POST', body: payload() })).status, 400);
      assert.equal((await request('/events', { method: 'OPTIONS' })).headers.get('access-control-allow-origin'), process.env.ANALYTICS_ALLOWED_ORIGINS);
    });
    await t.test('Owner and Admin have separate, live server permissions; user, moderator, forged claims and revoked sessions deny', async () => {
      await assert.rejects(Grant.create({ user: users.owner._id, role: 'owner', grantedBy: 'test', reason: 'Duplicate' }), error => error.code === 11000);
      await assert.rejects(Grant.create({ user: users.reader._id, role: 'superuser', grantedBy: 'test', reason: 'Invalid' }), error => error.name === 'ValidationError' && error.errors.role.kind === 'enum');
      for (const scope of ['owner', 'admin']) {
        assert.equal((await request(`/${scope}/report`, { user: scope })).status, 200);
        for (const user of [undefined, 'reader', 'moderator', 'inactive', scope === 'owner' ? 'admin' : 'owner']) assert.equal((await request(`/${scope}/report`, { user })).status, user === undefined || user === 'inactive' ? 401 : 403);
      }
      assert.deepEqual((await request('/capabilities', { user: 'owner' })).body.data, { owner: true, admin: false });
      const claims = jwt.decode(tokens.reader); delete claims.iat; delete claims.exp;
      const forged = jwt.sign({ ...claims, role: 'owner', owner: true, admin: true }, process.env.AUTH_ACCESS_TOKEN_SECRET, { expiresIn: 900 });
      assert.equal((await request('/owner/report', { user: forged })).status, 403);
      for (const section of ['overview', 'trends', 'pages', 'content-types', 'referrals', 'activity']) assert.equal((await request('/owner/' + section, { user: 'owner' })).status, 200);
      assert.equal((await request('/events', { user: 'owner' })).status, 404, 'There is no raw event read endpoint.');
      await Grant.updateOne({ user: users.owner._id }, { $set: { revokedAt: new Date() } });
      assert.equal((await request('/owner/report', { user: 'owner' })).status, 403);
      await Grant.updateOne({ user: users.owner._id }, { $unset: { revokedAt: '' } });
      await Session.updateOne({ _id: auth.admin.sessionId }, { $set: { revokedAt: new Date() } });
      assert.equal((await request('/admin/report', { user: 'admin' })).status, 401);
    });
    await t.test('aggregation distinguishes page views, distinct active sessions and estimated browsers across exact UTC windows', async () => {
      await Event.deleteMany({});
      const now = new Date(), today = Date.parse(now.toISOString().slice(0, 10)), visitorId = randomUUID(), sessionId = randomUUID();
      const record = (extra, daysAgo) => service.record(payload(extra), { now: new Date(today - daysAgo * DAY + 1000) });
      await record({ visitorId, sessionId }, 1); await record({ visitorId, sessionId, path: '/search' }, 1);
      await record({ visitorId, sessionId: randomUUID(), referral: 'search.example.test' }, 2);
      await service.record(payload(), { now: new Date(today - DAY + 1000), auth: auth.reader });
      await record({ visitorId, sessionId }, 8); // Previous 7 days; same browser across periods.
      const result = await service.report(auth.owner, 'owner', { days: '7' }, now);
      assert.deepEqual(result.metrics.pageViews, { current: 4, previous: 1, changePercent: 300 });
      assert.deepEqual(result.metrics.visits, { current: 3, previous: 1, changePercent: 200 });
      assert.deepEqual(result.metrics.estimatedVisitors, { current: 2, previous: 1, changePercent: 100 });
      assert.equal(result.pages.find(x => x.label === '/').pageViews, 3);
      assert.equal(result.contentTypes.find(x => x.label === 'search').pageViews, 1);
      assert.equal(result.activity.find(x => x.authenticated).pageViews, 1); assert.equal(result.activity.find(x => !x.authenticated).pageViews, 3);
      assert.equal(result.trends.length, 2); assert.equal(result.trends.reduce((sum, row) => sum + row.pageViews, 0), 4);
      for (const interval of ['week', 'month']) { const grouped = await service.report(auth.owner, 'owner', { days: '7', interval }, now); assert.equal(grouped.trends.reduce((sum, row) => sum + row.pageViews, 0), 4); }
      const previousDate = new Date(today - 8 * DAY).toISOString().slice(0, 10);
      const previous = await service.report(auth.owner, 'owner', { start: previousDate, end: previousDate }, now); assert.equal(previous.metrics.pageViews.current, 1);
      const privateText = JSON.stringify(result); for (const secret of [visitorId, sessionId, String(users.reader._id), users.reader.email, 'Hash']) assert.equal(privateText.includes(secret), false);
      assert.equal(result.operations, undefined);
      assert.ok((await service.report(auth.admin, 'admin', {}, now)).operations.storageReady);
    });
    await t.test('date ranges, report sizes, unknown queries and invalid dates are rejected', async () => {
      for (const query of ['days=1', 'days=365', 'days=7&days=30', 'start=2026-02-30&end=2026-03-01', 'start=2026-02-03', 'start=2026-03-01&end=2026-02-01', 'start=2020-01-01&end=2026-01-01', 'start=2099-01-01&end=2099-01-02', 'days=7&start=2026-01-01&end=2026-01-02', 'interval=hour', 'limit=0', 'limit=51', 'limit=01', 'limit=1&limit=2', 'visitorHash=secret', 'start[$gt]=2026-01-01']) assert.equal((await request('/owner/report?' + query, { user: 'owner' })).status, 400, query);
    });
    await t.test('empty and incomplete coverage are explicit and retention excludes expiry lag and shortened windows', async () => {
      const now = new Date(); await Event.deleteMany({});
      let result = await service.report(auth.owner, 'owner', {}, now);
      assert.equal(result.coverage.empty, true); assert.equal(result.coverage.partial, true); assert.equal(result.coverage.previousPartial, true);
      assert.equal(result.metrics.pageViews.current, 0); assert.equal(result.metrics.pageViews.changePercent, null); assert.deepEqual(result.trends, []);
      // Raw collection write only for synthetic historical coverage in this disposable fixture.
      await State.collection.updateOne({ _id: 'collection' }, { $set: { startedAt: new Date(now - 200 * DAY) } });
      result = await service.report(auth.owner, 'owner', {}, now); assert.equal(result.coverage.partial, false); assert.equal(result.coverage.previousPartial, false);
      await service.record(payload(), { now: new Date(now - 10 * DAY) });
      await service.record(payload(), { now: new Date(now - DAY) });
      await Event.collection.updateOne({ occurredAt: { $gt: new Date(now - 2 * DAY) } }, { $set: { expiresAt: new Date(now - 1000) } });
      assert.equal((await service.report(auth.owner, 'owner', { days: '30' }, now)).metrics.pageViews.current, 1);
      process.env.ANALYTICS_RETENTION_DAYS = '7'; result = await service.report(auth.owner, 'owner', { days: '30' }, now);
      assert.equal(result.metrics.pageViews.current, 0); assert.equal(result.coverage.partial, true); process.env.ANALYTICS_RETENTION_DAYS = '180';
      const ttl = (await Event.collection.indexes()).find(x => x.name === 'analytics_expiry'); assert.equal(ttl.expireAfterSeconds, 0);
      for (const value of ['0', '366', 'NaN', '1.5']) { process.env.ANALYTICS_RETENTION_DAYS = value; assert.throws(() => analyticsConfig(), { status: 503 }); } process.env.ANALYTICS_RETENTION_DAYS = '180';
    });
    await t.test('storage/config failure closes analytics and leaves manuscript reading available', async () => {
      await Event.collection.dropIndex('analytics_event_unique'); await assert.rejects(assertAnalyticsStorage(), { status: 503 });
      assert.equal((await ingest(payload())).status, 503); await Event.createIndexes();
      process.env.ANALYTICS_ENABLED = 'false'; assert.equal((await ingest(payload())).status, 503);
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/books`); assert.equal(response.status, 200);
      process.env.ANALYTICS_ENABLED = 'true'; assert.equal(canonicalHash(), before);
    });
    await t.test('ingestion and reports have bounded rate limits', async () => {
      let last;
      for (let i = 0; i < 121; i++) last = await ingest(payload({ consent: false }), { headers: { 'X-Forwarded-For': '198.51.100.77' } });
      assert.equal(last.status, 429); assert.ok(Number(last.headers.get('retry-after')) > 0);
      for (let i = 0; i < 61; i++) last = await request('/capabilities', { user: 'owner', headers: { 'X-Forwarded-For': '198.51.100.88' } });
      assert.equal(last.status, 429);
    });
    assert.equal(canonicalHash(), before);
    for (const name of ['bookmarks', 'privatenotes', 'readingprogresses', 'readinghistories']) assert.equal(await mongoose.connection.collection(name).countDocuments(), 0);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await memory.stop(); }
});
