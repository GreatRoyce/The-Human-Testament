// Server-only authorization fixtures. No personal-data product model/route is
// installed, no .env/Atlas is loaded, and no real email can be sent.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.NODE_ENV = 'production'; // Keep the read-only method matrix out of access logs.
process.env.CONTENT_SOURCE = 'pdf';
process.env.AUTH_ENABLED = 'true';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url');
process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test';
delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
delete process.env.AUTH_COOKIE_SAME_SITE;
process.env.MAIL_DELIVERY_ENABLED = 'false';
delete process.env.EMAIL_VERIFICATION_FRONTEND_URL;
const app = require('../src/app');
const User = require('../src/models/User');
const RefreshSession = require('../src/models/RefreshSession');
const privateOwner = require('../src/models/privateOwner');
const { createOwnedResourceAccess } = require('../src/services/ownedResource.service');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { createSession } = require('../src/services/session.service');
const { setAccountActive } = require('../src/services/accountLifecycle.service');
const { getAuthConfig } = require('../src/config/auth');
const { authenticatedUser } = require('../src/utils/authorization');
const { authReady, authenticate, protectMutation, requireAuthenticated, requireActiveAccount,
  requireVerifiedEmail, requireRoles } = require('../src/middleware/auth.middleware');
const { bodyFields } = require('../src/utils/accountInput');
const password = 'Synthetic authorization passphrase!';

test('server authorization scopes private operations to the authenticated owner and preserves public content', { timeout: 1800000 }, async t => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
  let server, sequence = 0, requestNumber = 0;
  t.mock.method(console, 'info', () => {});
  try {
    await mongoose.connect(memory.getUri(), { dbName: 'human_testament_authorization_test', autoIndex: false, autoCreate: false });
    await initializeAuthStorage();
    const captured = [];
    const schema = new mongoose.Schema({ payload: { type: String, required: true, trim: true, maxlength: 120 } },
      { timestamps: true, strict: 'throw', autoCreate: false, autoIndex: false });
    schema.plugin(privateOwner);
    schema.pre(/^findOne/, function () { captured.push({ op: this.op, filter: { ...this.getFilter() } }); });
    const Fixture = mongoose.model('AuthorizationFixture', schema);
    await Fixture.createCollection(); await Fixture.createIndexes();
    const records = createOwnedResourceAccess(Fixture, { writableFields: ['payload'] });
    const hash = await bcrypt.hash(password, 12);
    const makeUser = overrides => User.create({ email: `authorization${++sequence}@example.test`, displayName: 'Synthetic Reader', passwordHash: hash, ...overrides });
    const accessFor = async user => (await createSession(await User.findById(user._id).select('+passwordHash'), getAuthConfig())).accessToken;
    const respond = handler => async (req, res, next) => {
      try { res.json({ success: true, data: await handler(req) }); } catch (error) { next(error); }
    };
    const testApp = express(), router = express.Router();
    testApp.use(express.json());
    router.use(authReady, authenticate);
    router.get('/identity', requireAuthenticated, respond(req => ({ keys: Object.keys(req.auth.user).sort(),
      contextKeys: Object.keys(req.auth).sort(), plain: Object.getPrototypeOf(req.auth.user) === Object.prototype,
      frozen: Object.isFrozen(req.auth.user), id: String(req.auth.user._id) })));
    router.get('/active', requireActiveAccount, respond(() => ({ allowed: true })));
    router.get('/verified', requireVerifiedEmail, respond(() => ({ allowed: true })));
    router.get('/user-role', requireRoles('user'), respond(() => ({ allowed: true })));
    router.get('/reserved-admin', requireRoles('admin'), respond(() => ({ allowed: true })));
    router.get('/deny-default', requireRoles(), respond(() => ({ allowed: true })));
    router.get('/records/:id', respond(req => records.findById(req.auth, req.params.id, req.query)));
    router.post('/records', protectMutation, respond(req => records.create(req.auth, req.body, req.query)));
    router.patch('/records/:id', protectMutation, respond(req => records.updateById(req.auth, req.params.id, req.body, req.query)));
    router.delete('/records/:id', protectMutation, respond(req => records.deleteById(req.auth, req.params.id, req.query)));
    testApp.use('/authorization-fixture', router);
    testApp.use(app);
    testApp.use(require('../src/middleware/error.middleware'));
    server = await new Promise(resolve => { const listener = testApp.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
      const requestBody = body === undefined && method === 'DELETE' ? {} : body;
      const response = await fetch(base + path, { method, signal: AbortSignal.timeout(20000), headers: {
        Origin: process.env.AUTH_ALLOWED_ORIGINS, 'X-CSRF-Protection': '1', 'Content-Type': 'application/json',
        'X-Forwarded-For': `198.51.100.${++requestNumber % 250 + 1}`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
      }, ...(requestBody !== undefined ? { body: JSON.stringify(requestBody) } : {}) });
      return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
    }
    const fixture = (path, options) => request('/authorization-fixture' + path, options);
    const create = (token, body = { payload: 'Private fixture content' }, query = '') => fixture('/records' + query, { method: 'POST', token, body });
    const alice = await makeUser(), bob = await makeUser({ emailVerified: true });
    const aliceToken = await accessFor(alice), bobToken = await accessFor(bob);
    const created = await create(aliceToken); assert.equal(created.status, 200);
    const recordId = created.body.data._id;
    const bobCreated = await create(bobToken, { payload: 'Bob private content' });
    assert.equal(bobCreated.status, 200); const bobId = bobCreated.body.data._id;

    await t.test('missing authentication and client-supplied identity headers are consistently unauthorized', async () => {
      const expected = { success: false, message: 'Authentication required.' };
      for (const options of [{}, { headers: { 'X-User-Id': String(alice._id), userId: String(alice._id) } },
        { headers: { Cookie: '__Secure-htt_refresh=not-an-access-token' } }]) {
        const result = await fixture('/records/' + recordId, options);
        assert.equal(result.status, 401); assert.deepEqual(result.body, expected); assert.equal(result.cache, 'no-store');
      }
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        const result = await fixture('/records' + (method === 'POST' ? '' : '/' + recordId), { method, body: { payload: 'Denied' } });
        assert.equal(result.status, 401); assert.deepEqual(result.body, expected);
      }
    });
    await t.test('invalid, expired, wrong-purpose and forged access claims cannot reach private data', async () => {
      const claims = jwt.decode(aliceToken);
      const sign = (changes, secret = process.env.AUTH_ACCESS_TOKEN_SECRET) => jwt.sign(
        Object.fromEntries(Object.entries({ ...claims, ...changes }).filter(([, value]) => value !== undefined)), secret, { algorithm: 'HS256' });
      for (const token of ['not-a-token', sign({ exp: Math.floor(Date.now() / 1000) - 1 }),
        sign({ tokenUse: 'refresh' }), sign({ sub: String(bob._id) }), sign({ sid: 'invalid' }),
        sign({ sub: String(new mongoose.Types.ObjectId()) }), sign({}, randomBytes(48).toString('hex')),
        sign({ exp: undefined }), sign({ pca: undefined })]) {
        const result = await fixture('/records/' + recordId, { token });
        assert.equal(result.status, 401); assert.deepEqual(result.body, { success: false, message: 'Authentication required.' });
      }
    });
    await t.test('request identity is a minimal projected plain object and ignores spoofed user IDs', async () => {
      const result = await fixture('/identity?userId=' + bob._id, { token: aliceToken, headers: { 'X-User-Id': String(bob._id) } });
      assert.equal(result.status, 200); assert.equal(result.body.data.id, String(alice._id));
      assert.deepEqual(result.body.data.keys, ['_id', 'displayName', 'email', 'emailVerified', 'isActive', 'role']);
      assert.deepEqual(result.body.data.contextKeys, ['sessionId', 'user']);
      assert.equal(result.body.data.plain, true); assert.equal(result.body.data.frozen, true);
      assert.ok(!JSON.stringify(result.body).includes(hash));
    });
    await t.test('active/authenticated gates work without requiring email ownership on ordinary resources', async () => {
      assert.equal((await fixture('/active', { token: aliceToken })).status, 200);
      assert.equal((await fixture('/verified', { token: aliceToken })).status, 403);
      assert.equal((await fixture('/verified', { token: bobToken })).status, 200);
      assert.equal((await fixture('/records/' + recordId, { token: aliceToken })).status, 200);
      assert.equal((await request('/api/auth/me', { token: aliceToken })).status, 200);
      for (const token of [undefined, aliceToken, bobToken]) {
        const verse = await request('/api/verses/freedom:10:14', { token });
        assert.equal(verse.status, 200); assert.equal(verse.body.data.text, 'Responsibility is the shadow cast by freedom.');
      }
    });
    await t.test('reserved administrator and empty role checks deny ordinary users by default', async () => {
      assert.deepEqual(User.schema.path('role').enumValues, ['user']);
      for (const token of [aliceToken, bobToken]) {
        assert.equal((await fixture('/user-role', { token })).status, 200);
        for (const path of ['/reserved-admin', '/deny-default']) {
          const result = await fixture(path, { token }); assert.equal(result.status, 403);
          assert.deepEqual(result.body, { success: false, message: 'Forbidden.' });
        }
      }
      assert.equal((await fixture('/reserved-admin')).status, 401);
      const corrupted = await makeUser();
      // Deliberately bypass validators in this disposable DB to prove that an
      // unsupported persisted role cannot turn the reserved guard into a grant.
      await User.collection.updateOne({ _id: corrupted._id }, { $set: { role: 'admin' } });
      const token = await accessFor(corrupted);
      assert.equal((await fixture('/reserved-admin', { token })).status, 403);
      assert.equal((await fixture('/user-role', { token })).status, 403);
    });
    await t.test('a required immutable owner reference and lookup index belong only to private schemas', async () => {
      await assert.rejects(Fixture.create({ payload: 'Missing owner' }), { name: 'ValidationError' });
      const owner = Fixture.schema.path('owner'); assert.equal(owner.options.ref, 'User');
      assert.equal(owner.options.required, true); assert.equal(owner.options.immutable, true);
      const indexes = await Fixture.collection.indexes(); assert.ok(indexes.some(index => index.key.owner === 1 && index.key._id === 1));
      const document = await Fixture.findById(recordId); document.owner = bob._id;
      await assert.rejects(document.save(), { name: 'ValidationError' });
      assert.equal(String((await Fixture.findById(recordId)).owner), String(alice._id));
      assert.equal(require('../src/models/Note').schema.path('owner'), undefined);
      assert.throws(() => createOwnedResourceAccess(require('../src/models/Note')), /immutable User owner/);
    });
    await t.test('a user can read, update and delete their own record with ownership in every query', async () => {
      const own = await create(aliceToken, { payload: 'Temporary private content' }); const id = own.body.data._id;
      assert.equal(own.body.data.owner, String(alice._id));
      captured.length = 0;
      const read = await fixture('/records/' + id, { token: aliceToken });
      const update = await fixture('/records/' + id, { token: aliceToken, method: 'PATCH', body: { payload: 'Updated private content' } });
      const remove = await fixture('/records/' + id, { token: aliceToken, method: 'DELETE' });
      assert.equal(read.status, 200); assert.equal(update.status, 200); assert.equal(remove.status, 200);
      assert.equal(update.body.data.payload, 'Updated private content');
      assert.deepEqual(captured.map(item => item.op), ['findOne', 'findOneAndUpdate', 'findOneAndDelete']);
      for (const item of captured) {
        assert.deepEqual(Object.keys(item.filter).sort(), ['_id', 'owner']);
        assert.equal(String(item.filter.owner), String(alice._id)); assert.equal(String(item.filter._id), id);
      }
      assert.equal(await Fixture.countDocuments({ _id: id }), 0);
    });
    await t.test('another user cannot read, mutate or delete a record even with a valid ID and spoofed identity', async () => {
      for (const method of ['GET', 'PATCH', 'DELETE']) {
        const result = await fixture('/records/' + bobId, { token: aliceToken, method,
          ...(method === 'PATCH' ? { body: { payload: 'Attacker update' } } : {}), headers: { 'X-User-Id': String(bob._id) } });
        assert.equal(result.status, 404); assert.deepEqual(result.body, { success: false, message: 'Resource not found.' });
        assert.ok(!JSON.stringify(result.body).includes('Bob private content'));
      }
      const untouched = await Fixture.findById(bobId); assert.equal(untouched.payload, 'Bob private content');
      assert.equal(String(untouched.owner), String(bob._id));
    });
    await t.test('resource guessing uses the same not-found response for foreign, absent and malformed IDs', async () => {
      const unknown = String(new mongoose.Types.ObjectId());
      for (const id of [bobId, unknown, 'not-an-id', 'a'.repeat(23), 'a'.repeat(25)]) for (const method of ['GET', 'PATCH', 'DELETE']) {
        const result = await fixture('/records/' + id, { token: aliceToken, method,
          ...(method === 'PATCH' ? { body: { payload: 'Guess' } } : {}) });
        assert.equal(result.status, 404); assert.deepEqual(result.body, { success: false, message: 'Resource not found.' });
      }
    });
    await t.test('creation derives ownership from authentication and rejects foreign IDs in body/query input', async () => {
      const count = await Fixture.countDocuments();
      for (const field of ['userId', 'owner', 'ownerId', 'user', '_id', 'role', 'isActive', 'emailVerified']) {
        const result = await create(aliceToken, { payload: 'Denied ownership', [field]: String(bob._id) }); assert.equal(result.status, 400);
      }
      for (const query of ['?userId=' + bob._id, '?owner=' + bob._id, '?ownerId=' + bob._id, '?owner[$ne]=' + alice._id])
        assert.equal((await create(aliceToken, { payload: 'Denied query' }, query)).status, 400);
      assert.equal(await Fixture.countDocuments(), count);
    });
    await t.test('updates reject ownership transfer, operators, unknown fields and query-based scope overrides', async () => {
      for (const changes of [{ owner: bob._id }, { userId: bob._id }, { ownerId: bob._id }, { user: bob._id },
        { $set: { owner: bob._id } }, { 'owner.id': String(bob._id) }, { payload: 'Changed', role: 'admin' }, {}]) {
        assert.equal((await fixture('/records/' + recordId, { token: aliceToken, method: 'PATCH', body: changes })).status, 400);
      }
      for (const method of ['GET', 'PATCH', 'DELETE']) for (const query of ['?owner=' + bob._id, '?userId=' + bob._id, '?_id=' + bobId]) {
        assert.equal((await fixture('/records/' + recordId + query, { token: aliceToken, method,
          ...(method === 'PATCH' ? { body: { payload: 'Denied query' } } : {}) })).status, 400);
      }
      const unchanged = await Fixture.findById(recordId); assert.equal(String(unchanged.owner), String(alice._id));
      assert.equal(unchanged.payload, 'Private fixture content');
    });
    await t.test('inactive/missing users and revoked/expired sessions cannot access any private operation', async () => {
      const inactive = await makeUser(), token = await accessFor(inactive);
      const own = await create(token); const id = own.body.data._id;
      await setAccountActive(inactive._id, false);
      for (const method of ['GET', 'PATCH', 'DELETE']) {
        assert.equal((await fixture('/records/' + id, { token, method,
          ...(method === 'PATCH' ? { body: { payload: 'Denied inactive' } } : {}) })).status, 401);
      }
      assert.equal((await create(token)).status, 401); assert.equal(await RefreshSession.countDocuments({ user: inactive._id, revokedAt: null }), 0);
      await setAccountActive(inactive._id, true); assert.equal((await fixture('/records/' + id, { token })).status, 401);
      const missing = await makeUser(), deletedToken = await accessFor(missing); await User.deleteOne({ _id: missing._id });
      assert.equal((await fixture('/records/' + id, { token: deletedToken })).status, 401);
      const expired = await makeUser(), expiredToken = await accessFor(expired);
      await RefreshSession.updateMany({ user: expired._id }, { $set: { expiresAt: new Date(0) } }, { runValidators: true });
      assert.equal((await fixture('/active', { token: expiredToken })).status, 401);
    });
    await t.test('a real password change invalidates old private access while preserving records for the new login', async () => {
      const user = await makeUser(), token = await accessFor(user), own = await create(token), id = own.body.data._id;
      const nextPassword = 'Replacement authorization passphrase!';
      const changed = await request('/api/auth/change-password', { token, method: 'POST',
        body: { currentPassword: password, newPassword: nextPassword, passwordConfirmation: nextPassword } });
      assert.equal(changed.status, 200); assert.equal((await fixture('/records/' + id, { token })).status, 401);
      const next = await accessFor(user); assert.equal((await fixture('/records/' + id, { token: next })).status, 200);
      assert.equal((await Fixture.findById(id)).payload, 'Private fixture content');
    });
    await t.test('ordinary account input cannot assign roles, verification, activity or another account identity', async () => {
      const before = await User.findById(alice._id).lean();
      for (const field of ['role', 'emailVerified', 'isActive', 'userId']) {
        const register = await request('/api/auth/register', { method: 'POST', body: {
          email: 'not-created@example.test', displayName: 'Not Created', password, [field]: 'client-controlled' } });
        assert.equal(register.status, 400);
        const changed = await request('/api/auth/change-password', { method: 'POST', token: aliceToken, body: {
          currentPassword: password, newPassword: password + 'new', passwordConfirmation: password + 'new', [field]: 'client-controlled' } });
        assert.equal(changed.status, 400);
      }
      for (const method of ['PATCH', 'PUT']) for (const path of ['/api/auth/me', '/api/auth/profile', '/api/users/' + alice._id])
        assert.equal((await request(path, { method, token: aliceToken, body: { role: 'admin', emailVerified: true, isActive: false } })).status, 404);
      const after = await User.findById(alice._id).lean();
      assert.equal(after.role, before.role); assert.equal(after.emailVerified, before.emailVerified); assert.equal(after.isActive, before.isActive);
      assert.equal(await User.countDocuments({ email: 'not-created@example.test' }), 0);
    });
    await t.test('canonical endpoints reject write methods for anonymous and ordinary authenticated users', async () => {
      const paths = ['/api/books', '/api/books/freedom', '/api/books/freedom/chapters', '/api/books/freedom/chapters/10',
        '/api/books/freedom/chapters/10/verses', '/api/books/freedom/chapters/10/verses/14',
        '/api/books/freedom/chapters/10/verses/14/supporting-material', '/api/verses/freedom:10:14',
        '/api/glossary', '/api/cross-references', '/api/cross-references/index', '/api/sections', '/api/search',
        '/api/editions', '/api/ingestion', '/api/publication', '/api/admin'];
      for (const token of [undefined, aliceToken]) for (const path of paths) for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const result = await request(path, { token, method, body: { text: 'Forbidden manuscript edit', published: true } });
        assert.equal(result.status, 404, method + ' ' + path);
      }
      const verse = await request('/api/verses/freedom:10:14');
      assert.equal(verse.status, 200); assert.equal(verse.body.data.text, 'Responsibility is the shadow cast by freedom.');
      // /api/notes now stores private reader notes, never canonical editorial notes.
      assert.equal((await request('/api/notes', { method: 'POST', body: { text: 'Forbidden manuscript edit' } })).status, 401);
      assert.equal((await request('/api/notes', { token: aliceToken, method: 'POST', body: { text: 'Forbidden manuscript edit', published: true } })).status, 400);
    });
    await t.test('private fixture routes exist only in this test server and preserve mutation defenses', async () => {
      for (const headers of [{ Origin: 'https://attacker.test' }, { 'X-CSRF-Protection': '' }])
        assert.equal((await fixture('/records', { token: aliceToken, method: 'POST', body: { payload: 'Denied CSRF' }, headers })).status, 403);
      // The test-only fixture router is never registered in the production app.
      const production = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
      try {
        const response = await fetch(`http://127.0.0.1:${production.address().port}/authorization-fixture/records/${recordId}`);
        assert.equal(response.status, 404);
      } finally { await new Promise(resolve => production.close(resolve)); }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});

test('authorization and ownership helpers fail closed when authentication or model configuration is missing', async () => {
  const valid = { user: { _id: new mongoose.Types.ObjectId(), isActive: true, role: 'user', emailVerified: false }, sessionId: new mongoose.Types.ObjectId() };
  const run = (middleware, auth) => { let result; middleware({ auth }, {}, error => { result = error; }); return result; };
  for (const auth of [undefined, {}, { user: valid.user }, { ...valid, user: { ...valid.user, isActive: false } }, { ...valid, user: { _id: 'bad', isActive: true } }]) {
    assert.throws(() => authenticatedUser(auth), { status: 401 });
    for (const middleware of [requireAuthenticated, requireActiveAccount, requireVerifiedEmail, requireRoles('user')]) assert.equal(run(middleware, auth).status, 401);
  }
  assert.equal(run(requireActiveAccount, valid), undefined);
  assert.equal(run(requireRoles('user'), valid), undefined);
  for (const middleware of [requireRoles(), requireRoles('admin'), requireRoles('user', 'admin'), requireRoles('*')]) assert.equal(run(middleware, valid).status, 403);
  const schema = new mongoose.Schema({ payload: String }); schema.plugin(privateOwner);
  assert.throws(() => schema.plugin(privateOwner), /defined by the ownership plugin/);
  const Model = mongoose.model('AuthorizationUnitFixture', schema);
  for (const writableFields of [['owner'], ['userId'], ['$set'], ['owner.id'], ['unknown'], ['role'], 'payload'])
    assert.throws(() => createOwnedResourceAccess(Model, { writableFields }), /allowlist/);
  const records = createOwnedResourceAccess(Model, { writableFields: ['payload'] });
  for (const operation of [() => records.create(undefined, { payload: 'Denied' }), () => records.findById(undefined, String(new mongoose.Types.ObjectId())),
    () => records.updateById(undefined, String(new mongoose.Types.ObjectId()), { payload: 'Denied' }), () => records.deleteById(undefined, String(new mongoose.Types.ObjectId()))])
    await assert.rejects(operation(), { status: 401 });
  for (const field of ['role', 'emailVerified', 'isActive']) assert.throws(() => bodyFields({ displayName: 'Reader', [field]: 'Denied' }, ['displayName']), { status: 400 });
});
