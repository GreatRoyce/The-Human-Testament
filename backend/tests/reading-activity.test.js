// Isolated local databases and synthetic accounts only; never load .env/Atlas/mail.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.NODE_ENV = 'production'; process.env.CONTENT_SOURCE = 'pdf';
process.env.AUTH_ENABLED = 'true'; process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url');
process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test'; process.env.MAIL_DELIVERY_ENABLED = 'false';
delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST; delete process.env.AUTH_COOKIE_SAME_SITE;
const app = require('../src/app');
const User = require('../src/models/User');
const Session = require('../src/models/RefreshSession');
const Progress = require('../src/models/ReadingProgress');
const History = require('../src/models/ReadingHistory');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { createSession } = require('../src/services/session.service');
const { getAuthConfig } = require('../src/config/auth');
const reading = require('../src/services/reading.service');
const manuscript = require('../../shared/manuscript.json');
const canonicalHash = () => createHash('sha256').update(readFileSync(require.resolve('../../shared/manuscript.json'))).digest('hex');
const password = 'Synthetic reading activity passphrase!';
const origin = process.env.AUTH_ALLOWED_ORIGINS;
const checkpoint = overrides => ({ chapterNumber: 10, verseNumber: 14, expectedRevision: 0, eventId: randomUUID(), ...overrides });

test('reading progress and history are atomic, private, canonical and safe under concurrent navigation', { timeout: 1800000 }, async t => {
  const beforeHash = canonicalHash();
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
  let server, requestNumber = 0, userNumber = 0;
  try {
    await mongoose.connect(memory.getUri(), { dbName: 'human_testament_reading_activity_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage();
    const hash = await bcrypt.hash(password, 12);
    const makeUser = () => User.create({ email: `reading${++userNumber}@example.test`, displayName: 'Synthetic Reader', passwordHash: hash });
    const accessFor = async user => (await createSession(await User.findById(user._id).select('+passwordHash'), getAuthConfig())).accessToken;
    const alice = await makeUser(), bob = await makeUser(), aliceToken = await accessFor(alice), bobToken = await accessFor(bob);
    app.set('trust proxy', 1);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { method = 'GET', token = aliceToken, body, headers = {} } = {}) {
      const result = await fetch(base + path, { method, signal: AbortSignal.timeout(30000), headers: {
        Origin: origin, 'X-CSRF-Protection': '1', 'Content-Type': 'application/json',
        'X-Forwarded-For': `198.51.100.${++requestNumber % 250 + 1}`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: result.status, body: await result.json(), headers: result.headers };
    }
    const save = (body, options = {}, book = 'freedom') => request('/api/reading-progress/' + book, { method: 'PUT', body, ...options });
    const publicPaths = ['/api/verses/freedom:10:14', '/api/books/freedom/chapters/10', '/api/books'];
    const publicBefore = await Promise.all(publicPaths.map(path => request(path, { token: null })));
    let first, second;

    await t.test('empty progress/history have safe empty lists and missing own-book progress is 404', async () => {
      assert.deepEqual((await request('/api/reading-progress')).body.data, { items: [] });
      assert.equal((await request('/api/reading-progress/freedom')).status, 404);
      assert.deepEqual((await request('/api/reading-history')).body.data, { items: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    });
    await t.test('creating a checkpoint persists one per-book progress record and matching history with server timestamps', async () => {
      first = checkpoint(); const result = await save(first);
      assert.equal(result.status, 200); assert.equal(result.body.data.replayed, false);
      const item = result.body.data.item;
      assert.equal(item.bookId, 'freedom'); assert.equal(item.chapterNumber, 10); assert.equal(item.verseNumber, 14); assert.equal(item.revision, 1);
      for (const field of ['lastReadAt', 'createdAt', 'updatedAt']) assert.ok(Date.parse(item[field]));
      assert.deepEqual((await request('/api/reading-progress/freedom')).body.data.item, item);
      const history = (await request('/api/reading-history')).body.data;
      assert.equal(history.items.length, 1); assert.equal(history.items[0].visitedAt, item.lastReadAt);
      assert.deepEqual(Object.keys(item).sort(), ['bookId', 'chapterNumber', 'createdAt', 'lastReadAt', 'revision', 'updatedAt', 'verseNumber']);
      assert.deepEqual(Object.keys(history.items[0]).sort(), ['bookId', 'chapterNumber', 'createdAt', 'id', 'verseNumber', 'visitedAt']);
    });
    await t.test('repeated/concurrent requests with the same event ID are idempotent and never refresh visit times', async () => {
      const before = await request('/api/reading-progress/freedom');
      const repeated = await Promise.all(Array.from({ length: 8 }, () => save(first)));
      for (const result of repeated) { assert.equal(result.status, 200); assert.equal(result.body.data.replayed, true); assert.deepEqual(result.body.data.item, before.body.data.item); }
      assert.equal(await History.countDocuments({ user: alice._id }), 1);
      const user = await makeUser(), token = await accessFor(user), initial = checkpoint();
      const racing = await Promise.all(Array.from({ length: 8 }, () => save(initial, { token })));
      for (const result of racing) assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(racing.filter(result => !result.body.data.replayed).length, 1);
      assert.equal(await Progress.countDocuments({ user: user._id, bookId: 'freedom' }), 1);
      assert.equal(await History.countDocuments({ user: user._id, eventId: initial.eventId }), 1);
    });
    await t.test('updating a book advances revision, clears omitted verse, updates read time and preserves creation time', async () => {
      const before = (await request('/api/reading-progress/freedom')).body.data.item;
      second = checkpoint({ chapterNumber: 11, expectedRevision: 1 }); delete second.verseNumber;
      const result = await save(second); assert.equal(result.status, 200);
      const item = result.body.data.item;
      assert.equal(item.chapterNumber, 11); assert.equal(item.verseNumber, undefined); assert.equal(item.revision, 2);
      assert.equal(item.createdAt, before.createdAt); assert.ok(Date.parse(item.lastReadAt) >= Date.parse(before.lastReadAt));
      assert.equal(await Progress.countDocuments({ user: alice._id, bookId: 'freedom' }), 1);
      assert.equal(await History.countDocuments({ user: alice._id }), 2);
      const replay = await save(first); assert.equal(replay.status, 200); assert.equal(replay.body.data.replayed, true);
      assert.equal(replay.body.data.item.revision, 2); assert.equal(replay.body.data.item.chapterNumber, 11);
    });
    await t.test('stale writes, mismatched event reuses and racing first/updating writes cannot overwrite newer progress', async () => {
      assert.equal((await save(checkpoint())).status, 409);
      assert.equal((await save({ ...first, chapterNumber: 12 })).status, 409);
      assert.equal((await save({ ...first, expectedRevision: 2 })).status, 409);
      const updates = await Promise.all([save(checkpoint({ chapterNumber: 12, expectedRevision: 2 })), save(checkpoint({ chapterNumber: 13, expectedRevision: 2 }))]);
      assert.deepEqual(updates.map(result => result.status).sort(), [200, 409]);
      const saved = (await request('/api/reading-progress/freedom')).body.data.item;
      assert.equal(saved.revision, 3); assert.ok([12, 13].includes(saved.chapterNumber));
      assert.equal(await History.countDocuments({ user: alice._id }), 3);
      const user = await makeUser(), token = await accessFor(user);
      const creating = await Promise.all([save(checkpoint(), { token }), save(checkpoint({ verseNumber: 15 }), { token })]);
      assert.deepEqual(creating.map(result => result.status).sort(), [200, 409]);
      assert.equal(await Progress.countDocuments({ user: user._id }), 1); assert.equal(await History.countDocuments({ user: user._id }), 1);
    });
    await t.test('database unique indexes enforce per-user/book progress and per-user/event history independently', async () => {
      const existing = await Progress.findOne({ user: alice._id, bookId: 'freedom' }).lean(); delete existing._id;
      await assert.rejects(Progress.collection.insertOne(existing), error => error.code === 11000);
      const event = await History.findOne({ user: alice._id }).lean(); delete event._id;
      await assert.rejects(History.collection.insertOne(event), error => error.code === 11000);
      assert.equal((await save(first, { token: bobToken })).status, 200); // Identical key belongs to a different user.
    });
    await t.test('history failures roll back progress rather than leaving a partial checkpoint', async () => {
      const user = await makeUser(), token = await accessFor(user);
      t.mock.method(History, 'create', async () => { throw new Error('Synthetic history failure'); });
      try { assert.equal((await save(checkpoint(), { token })).status, 500); }
      finally { History.create.mock.restore(); }
      assert.equal(await Progress.countDocuments({ user: user._id }), 0); assert.equal(await History.countDocuments({ user: user._id }), 0);
    });
    await t.test('invalid books, chapters, verses, numeric inputs and unsupported fields are rejected without new records', async () => {
      const before = await History.countDocuments({ user: alice._id });
      for (const book of ['unknown', 'Freedom', 'freedom:10:14']) assert.equal((await save(checkpoint(), {}, book)).status, 404);
      for (const location of [{ chapterNumber: 999 }, { verseNumber: 999 }]) assert.equal((await save(checkpoint(location))).status, 404);
      for (const input of [null, [], {}, checkpoint({ chapterNumber: 0 }), checkpoint({ chapterNumber: '10' }), checkpoint({ chapterNumber: 1.5 }),
        checkpoint({ verseNumber: null }), checkpoint({ verseNumber: 0 }), checkpoint({ verseNumber: '14' }), checkpoint({ expectedRevision: -1 }),
        checkpoint({ expectedRevision: '0' }), checkpoint({ eventId: 'not-a-uuid' }), checkpoint({ expectedRevision: Number.MAX_SAFE_INTEGER })])
        assert.equal((await save(input)).status, 400, JSON.stringify(input));
      assert.equal(await History.countDocuments({ user: alice._id }), before);
      const unresolved = manuscript.unresolvedReferences[0], token = await accessFor(await makeUser());
      const result = await save(checkpoint({ chapterNumber: unresolved.chapter, verseNumber: unresolved.verse }), { token }, unresolved.bookSlug);
      assert.equal(result.status, 200); assert.equal(result.body.data.item.verseNumber, unresolved.verse);
    });
    await t.test('history is paginated newest first, filtered by book and private to its owner', async () => {
      const event = checkpoint({ chapterNumber: 1, verseNumber: 2 });
      assert.equal((await save(event, {}, 'inquiry')).status, 200);
      const list = (await request('/api/reading-history?limit=2')).body.data;
      assert.equal(list.pagination.total, 4); assert.equal(list.items.length, 2); assert.equal(list.items[0].bookId, 'inquiry');
      assert.ok(Date.parse(list.items[0].visitedAt) >= Date.parse(list.items[1].visitedAt));
      const next = (await request('/api/reading-history?limit=2&page=2')).body.data;
      assert.equal(next.items.length, 2); assert.equal(new Set([...list.items, ...next.items].map(item => item.id)).size, 4);
      assert.equal((await request('/api/reading-history?bookId=freedom')).body.data.pagination.total, 3);
      const own = (await request('/api/reading-progress', { token: bobToken })).body.data.items;
      assert.equal(own.length, 1); assert.equal(own[0].chapterNumber, 10);
      assert.equal((await request('/api/reading-progress/inquiry', { token: bobToken })).status, 404);
      assert.equal((await request('/api/reading-history', { token: bobToken })).body.data.pagination.total, 1);
      assert.equal((await request('/api/reading-progress')).body.data.items[0].bookId, 'inquiry');
      for (const query of ['page=0', 'limit=51', 'page=1.2', 'page=10001', 'page=01', 'page=1&page=2', 'bookId[$ne]=x', 'userId=' + bob._id, 'sort=user'])
        assert.equal((await request('/api/reading-history?' + query)).status, 400, query);
      assert.equal((await request('/api/reading-history?bookId=unknown')).status, 404);
    });
    await t.test('owner, status, timestamp, canonical-text, update-operator and query injection cannot change another user', async () => {
      const before = (await request('/api/reading-progress/freedom')).body.data.item;
      for (const field of ['user', 'userId', 'owner', 'ownerId', '_id', 'bookId', 'revision', 'lastReadAt', 'createdAt', 'visitedAt', 'text', '$set', 'user.id'])
        assert.equal((await save(checkpoint({ expectedRevision: before.revision, [field]: String(bob._id) }))).status, 400, field);
      for (const path of ['/api/reading-progress', '/api/reading-progress/freedom', '/api/reading-history'])
        assert.equal((await request(path + '?userId=' + bob._id)).status, 400);
      assert.equal((await request('/api/reading-progress/freedom?owner=' + bob._id, { method: 'PUT', body: checkpoint() })).status, 400);
      assert.deepEqual((await request('/api/reading-progress/freedom', { headers: { 'X-User-Id': String(bob._id) } })).body.data.item, before);
      assert.equal((await request('/api/reading-history/' + String(bob._id))).status, 404);
      for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await request('/api/reading-history', { method, body: {} })).status, 404);
    });
    await t.test('unauthenticated, forged, revoked and inactive sessions cannot read or mutate activity', async () => {
      const inactive = await makeUser(), inactiveToken = await accessFor(inactive);
      await User.updateOne({ _id: inactive._id }, { $set: { isActive: false } });
      const revoked = await makeUser(), revokedToken = await accessFor(revoked);
      await Session.updateMany({ user: revoked._id }, { $set: { revokedAt: new Date() } });
      for (const token of [null, 'invalid', inactiveToken, revokedToken]) {
        for (const path of ['/api/reading-progress', '/api/reading-progress/freedom', '/api/reading-history']) {
          const result = await request(path, { token }); assert.equal(result.status, 401); assert.equal(result.headers.get('cache-control'), 'no-store');
        }
        assert.equal((await save(checkpoint(), { token })).status, 401);
      }
      const newSession = await accessFor(alice);
      assert.deepEqual((await request('/api/reading-progress', { token: newSession })).body, (await request('/api/reading-progress')).body);
    });
    await t.test('PUT retains origin, CSRF, JSON and credentialed CORS protections; history is read only', async () => {
      for (const headers of [{ Origin: 'https://attacker.test' }, { Origin: '' }, { 'X-CSRF-Protection': '' }])
        assert.equal((await save(checkpoint(), { headers })).status, 403);
      assert.equal((await save(checkpoint(), { headers: { 'Content-Type': 'text/plain' } })).status, 415);
      const preflight = await fetch(base + '/api/reading-progress/freedom', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT' } });
      assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true'); assert.match(preflight.headers.get('access-control-allow-methods'), /PUT/);
      const denied = await request('/api/reading-history', { headers: { Origin: 'https://attacker.test' } });
      assert.equal(denied.headers.get('access-control-allow-origin'), null); assert.equal(denied.headers.get('cache-control'), 'no-store');
    });
    await t.test('required indexes fail closed, initialization is repeatable and no history retention is silently enabled', async () => {
      await Progress.collection.dropIndex('reading_progress_user_book_unique');
      assert.equal((await save(checkpoint())).status, 503); assert.equal((await request('/api/reading-history')).status, 503);
      assert.equal((await request('/api/auth/me')).status, 200); assert.equal((await request('/api/bookmarks')).status, 200);
      await initializeAuthStorage();
      await History.collection.dropIndex('reading_history_user_event_unique');
      assert.equal((await save(checkpoint())).status, 503); await initializeAuthStorage();
      assert.equal((await request('/api/reading-history')).status, 200);
      assert.equal((await History.collection.indexes()).some(index => index.expireAfterSeconds !== undefined), false);
    });
    await t.test('the real frontend service resumes through the mounted API across separate logins without exporting credentials', async () => {
      const { createApiClient } = await import('../../frontend/src/services/api/client.js');
      const { createAuthService } = await import('../../frontend/src/services/auth.service.js');
      const { createReadingService, readingLocationUrl } = await import('../../frontend/src/services/reading.service.js');
      const client = createApiClient({ baseUrl: base, fetchImpl: (url, init) => fetch(url, { ...init, headers: { ...init.headers, Origin: origin } }) });
      const auth = createAuthService(client), service = createReadingService(auth), user = await makeUser();
      await assert.rejects(service.list(), { status: 401 });
      const loggedIn = await auth.login({ email: user.email, password }); assert.equal(loggedIn.accessToken, undefined);
      assert.equal(await service.get('freedom'), null);
      const input = checkpoint(), saved = await service.save('freedom', input);
      assert.equal(saved.item.revision, 1); assert.equal(readingLocationUrl(saved.item), '/testament/freedom/10/14');
      await auth.logout(); await assert.rejects(service.history(), { status: 401 });
      await auth.login({ email: user.email, password });
      assert.equal((await service.list())[0].verseNumber, 14); assert.equal((await service.history()).pagination.total, 1);
      assert.equal((await service.get('freedom')).revision, 1);
    });
    await t.test('models validate complete canonical locations and no activity record or public response duplicates private/canonical content', async () => {
      for (const Model of [Progress, History]) {
        const values = { user: alice._id, bookId: 'freedom', chapterNumber: 10, verseNumber: 14, revision: 1,
          ...(Model === History ? { eventId: randomUUID() } : {}) };
        await new Model(values).validate();
        await assert.rejects(new Model({ ...values, chapterNumber: 999 }).validate(), /Canonical reading location/);
        await assert.rejects(new Model({ ...values, verseNumber: 999 }).validate(), /Canonical reading location/);
        await assert.rejects(new Model({ ...values, user: undefined }).validate(), /user/);
        assert.throws(() => new Model({ ...values, text: 'No copied verse text' }), /strict mode/);
        assert.equal(Model.schema.path('user').options.immutable, true);
      }
      for (const Model of [Progress, History]) for (const record of await Model.find().lean()) {
        assert.equal(record.text, undefined); assert.equal(record.content, undefined); assert.equal(record.email, undefined);
      }
      const publicAfter = await Promise.all(publicPaths.map(path => request(path, { token: null })));
      assert.deepEqual(publicAfter.map(result => result.body), publicBefore.map(result => result.body));
      assert.equal(canonicalHash(), beforeHash);
      const names = (await mongoose.connection.db.listCollections().toArray()).map(item => item.name);
      for (const name of ['books', 'chapters', 'verses', 'notes', 'editions']) assert.equal(names.includes(name), false);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});

test('reading services fail closed before database access without a verified authenticated context', async () => {
  for (const auth of [undefined, {}, { user: { _id: new mongoose.Types.ObjectId(), isActive: true } }])
    for (const run of [() => reading.listProgress(auth), () => reading.getProgress(auth, 'freedom'),
      () => reading.saveProgress(auth, 'freedom', checkpoint()), () => reading.listHistory(auth)]) await assert.rejects(run(), { status: 401 });
});
