// Isolated loopback databases and synthetic identities only. Never load .env,
// connect to Atlas, or send real mail from profile tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.NODE_ENV = 'production';
process.env.CONTENT_SOURCE = 'pdf';
process.env.AUTH_ENABLED = 'true';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url');
process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test';
process.env.MAIL_DELIVERY_ENABLED = 'false';
delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
delete process.env.AUTH_COOKIE_SAME_SITE;
const app = require('../src/app');
const User = require('../src/models/User');
const RefreshSession = require('../src/models/RefreshSession');
const Verification = require('../src/models/EmailVerificationToken');
const Reset = require('../src/models/PasswordResetToken');
const users = require('../src/services/user.service');
const { createSession } = require('../src/services/session.service');
const { setAccountActive } = require('../src/services/accountLifecycle.service');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { getAuthConfig } = require('../src/config/auth');
const { createOpaqueToken } = require('../src/utils/tokens');
const password = 'Synthetic profile passphrase!';
const origin = process.env.AUTH_ALLOWED_ORIGINS;

test('profile endpoints return and update only the authenticated account with safe fields', { timeout: 1800000 }, async t => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
  let server, sequence = 0, requestNumber = 0;
  t.mock.method(console, 'info', () => {});
  try {
    await mongoose.connect(memory.getUri(), { dbName: 'human_testament_profile_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage();
    const hash = await bcrypt.hash(password, 12);
    const makeUser = overrides => User.create({ email: `profile${++sequence}@example.test`, displayName: 'Synthetic Reader', passwordHash: hash, ...overrides });
    const accessFor = async user => (await createSession(await User.findById(user._id).select('+passwordHash'), getAuthConfig())).accessToken;
    app.set('trust proxy', 1);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path = '/api/users/me', { method = 'GET', body, token, headers = {}, ip } = {}) {
      const response = await fetch(base + path, { method, signal: AbortSignal.timeout(20000), headers: {
        Origin: origin, 'X-CSRF-Protection': '1', 'Content-Type': 'application/json',
        'X-Forwarded-For': ip ?? `198.51.100.${++requestNumber % 250 + 1}`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json(), headers: response.headers };
    }
    const patch = (token, body, options = {}) => request('/api/users/me', { method: 'PATCH', token, body, ...options });
    const alice = await makeUser(), bob = await makeUser({ displayName: 'Other Reader', emailVerified: true });
    const aliceToken = await accessFor(alice), bobToken = await accessFor(bob);

    await t.test('own profile includes stable ID, display name, normalized email, verification and creation date only', async () => {
      for (const [user, token] of [[alice, aliceToken], [bob, bobToken]]) {
        const result = await request(undefined, { token }); assert.equal(result.status, 200);
        assert.deepEqual(result.body, { success: true, data: { user: { id: String(user._id), displayName: user.displayName,
          email: user.email, emailVerified: user.emailVerified, createdAt: user.createdAt.toISOString() } } });
        assert.equal(result.headers.get('cache-control'), 'no-store');
      }
    });
    await t.test('missing, forged, expired and cookie-only authentication cannot read or edit profiles', async () => {
      const claims = jwt.decode(aliceToken), expired = jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 1 }, process.env.AUTH_ACCESS_TOKEN_SECRET);
      for (const token of [undefined, 'invalid', expired, jwt.sign(claims, randomBytes(48).toString('hex'))]) {
        for (const result of [await request(undefined, { token }), await patch(token, { displayName: 'Denied' })]) {
          assert.equal(result.status, 401); assert.deepEqual(result.body, { success: false, message: 'Authentication required.' });
          assert.equal(result.headers.get('cache-control'), 'no-store');
        }
      }
      assert.equal((await request(undefined, { headers: { Cookie: '__Secure-htt_refresh=synthetic' } })).status, 401);
    });
    await t.test('valid display-name edits trim and validate through the User model without changing security state', async () => {
      const before = await User.findById(alice._id).select('+passwordHash').lean();
      for (const name of ['  Reader Updated  ', 'A', 'x'.repeat(80), '  Human Reader 漢字  ']) {
        const result = await patch(aliceToken, { displayName: name }); assert.equal(result.status, 200);
        assert.equal(result.body.data.user.displayName, name.trim()); assert.equal(result.body.data.user.id, String(alice._id));
        assert.equal(result.body.data.user.createdAt, before.createdAt.toISOString());
      }
      const after = await User.findById(alice._id).select('+passwordHash').lean();
      for (const field of ['passwordHash', 'role', 'email', 'emailVerified', 'isActive', 'passwordChangedAt']) assert.deepEqual(after[field], before[field]);
      assert.equal((await request('/api/auth/me', { token: aliceToken })).body.data.user.displayName, 'Human Reader 漢字');
      assert.equal((await request(undefined, { token: bobToken })).body.data.user.displayName, 'Other Reader');
    });
    await t.test('empty, oversized, control-containing and non-string names fail without partial edits', async () => {
      const before = (await User.findById(alice._id)).displayName;
      for (const value of ['', '   ', 'x'.repeat(81), 'Reader\nName', 'Reader\tName', 'Reader\u007fName', 42, null, [], { $ne: '' }]) {
        const result = await patch(aliceToken, { displayName: value }); assert.equal(result.status, 400);
        assert.ok(!JSON.stringify(result.body).includes('Reader\nName'));
      }
      assert.equal((await User.findById(alice._id)).displayName, before);
    });
    await t.test('unsupported, privileged, credential, ownership and operator fields are rejected rather than ignored', async () => {
      const before = await User.findById(alice._id).select('+passwordHash').lean();
      for (const [field, value] of Object.entries({ role: 'admin', emailVerified: true, isActive: false, email: bob.email,
        passwordHash: hash, password: 'Do not store', passwordChangedAt: new Date().toISOString(), userId: String(bob._id),
        _id: String(bob._id), owner: String(bob._id), sessionId: String(new mongoose.Types.ObjectId()), refreshToken: 'synthetic',
        resetToken: 'synthetic', preferences: {}, createdAt: new Date(0).toISOString(), $set: { role: 'admin' }, 'user.role': 'admin' })) {
        assert.equal((await patch(aliceToken, { displayName: 'Must not apply', [field]: value })).status, 400);
      }
      for (const body of [null, [], {}, { displayName: undefined }]) assert.equal((await patch(aliceToken, body)).status, 400);
      const after = await User.findById(alice._id).select('+passwordHash').lean();
      for (const field of ['displayName', 'email', 'role', 'emailVerified', 'isActive', 'passwordHash']) assert.deepEqual(after[field], before[field]);
    });
    await t.test('query/path/body identity changes cannot retrieve or edit another account', async () => {
      const own = await request(undefined, { token: aliceToken, headers: { 'X-User-Id': String(bob._id), userId: String(bob._id) } });
      assert.equal(own.status, 200); assert.equal(own.body.data.user.id, String(alice._id));
      for (const query of ['?userId=' + bob._id, '?_id=' + bob._id, '?email=' + bob.email, '?owner[$ne]=' + alice._id]) {
        assert.equal((await request('/api/users/me' + query, { token: aliceToken })).status, 400);
        assert.equal((await request('/api/users/me' + query, { token: aliceToken, method: 'PATCH', body: { displayName: 'Denied' } })).status, 400);
      }
      for (const method of ['GET', 'PATCH']) assert.equal((await request('/api/users/' + bob._id, { token: aliceToken, method,
        ...(method === 'PATCH' ? { body: { displayName: 'Denied' } } : {}) })).status, 404);
      assert.equal((await patch(aliceToken, { displayName: 'Denied', userId: String(bob._id) })).status, 400);
      assert.equal((await User.findById(bob._id)).displayName, 'Other Reader');
    });
    await t.test('responses contain no credential/token/security fields even when related records exist', async () => {
      const reset = createOpaqueToken('password-reset'), verify = createOpaqueToken('email-verification');
      await Reset.create({ user: alice._id, tokenHash: reset.tokenHash, expiresAt: new Date(Date.now() + 60000) });
      await Verification.create({ user: alice._id, tokenHash: verify.tokenHash, expiresAt: new Date(Date.now() + 60000) });
      for (const result of [await request(undefined, { token: aliceToken }), await patch(aliceToken, { displayName: 'Safe Reader' })]) {
        assert.equal(result.status, 200);
        assert.deepEqual(Object.keys(result.body.data.user).sort(), ['createdAt', 'displayName', 'email', 'emailVerified', 'id']);
        const serialized = JSON.stringify(result.body);
        for (const secret of [hash, password, reset.token, reset.tokenHash, verify.token, verify.tokenHash]) assert.ok(!serialized.includes(secret));
        for (const field of ['passwordHash', 'tokenHash', 'sessionId', 'role', 'isActive', 'passwordChangedAt', '__v', 'updatedAt']) assert.equal(field in result.body.data.user, false);
      }
    });
    await t.test('profile edits preserve existing sessions and verification remains controlled by its dedicated flow', async () => {
      const secondDevice = await accessFor(alice), sessionCount = await RefreshSession.countDocuments({ user: alice._id, revokedAt: null });
      assert.equal((await patch(aliceToken, { displayName: 'Session Reader' })).status, 200);
      assert.equal(await RefreshSession.countDocuments({ user: alice._id, revokedAt: null }), sessionCount);
      assert.equal((await request(undefined, { token: secondDevice })).status, 200);
      assert.equal((await request(undefined, { token: aliceToken })).body.data.user.emailVerified, false);
      const credential = createOpaqueToken('email-verification');
      await Verification.create({ user: alice._id, tokenHash: credential.tokenHash, expiresAt: new Date(Date.now() + 60000), deliveryStatus: 'accepted' });
      const verified = await request('/api/auth/verify-email', { method: 'POST', body: { token: credential.token } }); assert.equal(verified.status, 200);
      assert.equal((await request(undefined, { token: aliceToken })).body.data.user.emailVerified, true);
      assert.equal((await patch(aliceToken, { displayName: 'Verified Reader' })).body.data.user.emailVerified, true);
    });
    await t.test('password changes and deactivation invalidate profile access on both verbs', async () => {
      const user = await makeUser(), token = await accessFor(user), nextPassword = 'Synthetic replacement profile passphrase!';
      const changed = await request('/api/auth/change-password', { method: 'POST', token,
        body: { currentPassword: password, newPassword: nextPassword, passwordConfirmation: nextPassword } });
      assert.equal(changed.status, 200);
      assert.equal((await request(undefined, { token })).status, 401); assert.equal((await patch(token, { displayName: 'Denied' })).status, 401);
      const fresh = await accessFor(user); assert.equal((await request(undefined, { token: fresh })).status, 200);
      await setAccountActive(user._id, false);
      assert.equal((await request(undefined, { token: fresh })).status, 401); assert.equal((await patch(fresh, { displayName: 'Denied inactive' })).status, 401);
      await setAccountActive(user._id, true); assert.equal((await request(undefined, { token: fresh })).status, 401);
    });
    await t.test('credentialed CORS preflights permit PATCH only for trusted origins and CSRF/media checks stay enforced', async () => {
      const allowed = await fetch(base + '/api/users/me', { method: 'OPTIONS', headers: { Origin: origin,
        'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'Authorization,Content-Type,X-CSRF-Protection' } });
      assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
      assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true'); assert.match(allowed.headers.get('access-control-allow-methods'), /PATCH/);
      const denied = await fetch(base + '/api/users/me', { method: 'OPTIONS', headers: { Origin: 'https://attacker.test', 'Access-Control-Request-Method': 'PATCH' } });
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
      for (const headers of [{ Origin: 'https://attacker.test' }, { Origin: '' }, { 'X-CSRF-Protection': '' }])
        assert.equal((await patch(aliceToken, { displayName: 'Denied CSRF' }, { headers })).status, 403);
      assert.equal((await patch(aliceToken, { displayName: 'Denied media' }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
      const alternate = await request('/API/USERS/ME', { token: aliceToken }); assert.equal(alternate.status, 200);
      assert.equal(alternate.headers.get('access-control-allow-origin'), origin);
    });
    await t.test('malformed JSON is safe/noncacheable and profile edits have a bounded IP rate limit', async () => {
      const malformed = await fetch(base + '/api/users/me', { method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`, 'X-CSRF-Protection': '1' }, body: '{"displayName":"do not echo"' });
      assert.equal(malformed.status, 400); assert.equal(malformed.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await malformed.json(), { success: false, message: 'Invalid JSON request body.' });
      for (let i = 0; i < 30; i++) assert.equal((await patch(aliceToken, { displayName: 'Rate Reader' }, { ip: '192.0.2.120' })).status, 200);
      const limited = await patch(aliceToken, { displayName: 'Denied rate' }, { ip: '192.0.2.120' });
      assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
    });
    await t.test('email changes and new session-management endpoints are absent; public reading stays available', async () => {
      assert.equal((await request('/api/users/me/email', { token: aliceToken, method: 'PATCH', body: { email: bob.email, currentPassword: password } })).status, 404);
      assert.equal((await patch(aliceToken, { email: bob.email })).status, 400);
      assert.equal((await request('/api/users/me/sessions', { token: aliceToken })).status, 404);
      const verse = await request('/api/verses/freedom:10:14'); assert.equal(verse.status, 200);
      assert.equal(verse.body.data.text, 'Responsibility is the shadow cast by freedom.');
    });
    await t.test('the real frontend service retrieves and patches the mounted profile API without exposing access tokens', async () => {
      const { createApiClient } = await import('../../frontend/src/services/api/client.js');
      const { createAuthService } = await import('../../frontend/src/services/auth.service.js');
      const client = createApiClient({ baseUrl: base, fetchImpl: (url, init) => fetch(url, { ...init, headers: { ...init.headers, Origin: origin } }) });
      const auth = createAuthService(client);
      const login = await auth.login({ email: bob.email, password }); assert.equal(login.accessToken, undefined);
      assert.equal((await auth.getProfile()).id, String(bob._id));
      const updated = await auth.updateProfile({ displayName: '  Frontend Reader  ', userId: String(alice._id), role: 'admin' });
      assert.equal(updated.displayName, 'Frontend Reader'); assert.equal(updated.email, bob.email); assert.equal(updated.emailVerified, true);
      assert.equal((await auth.getCurrentUser()).displayName, 'Frontend Reader');
      await auth.logout(); await assert.rejects(auth.getProfile(), { status: 401 });
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});

test('profile services fail closed without a trusted authenticated context', async () => {
  for (const auth of [undefined, {}, { user: { _id: new mongoose.Types.ObjectId(), isActive: true } }]) {
    await assert.rejects(users.getProfile(auth), { status: 401 });
    await assert.rejects(users.updateProfile(auth, { displayName: 'Denied' }), { status: 401 });
  }
});
