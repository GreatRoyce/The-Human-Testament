// Synthetic accounts in a disposable loopback database. Never load .env/Atlas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
process.env.NODE_ENV = 'production';
process.env.CONTENT_SOURCE = 'pdf';
process.env.AUTH_ENABLED = 'true';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url');
process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test';
delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
delete process.env.AUTH_COOKIE_SAME_SITE;
const app = require('../src/app');
const User = require('../src/models/User');
const RefreshSession = require('../src/models/RefreshSession');
const { initializeAuthStorage, assertAuthStorage } = require('../src/services/authStorage');
const { getAuthConfig } = require('../src/config/auth');
const { createRefreshToken, hashRefreshToken, validRefreshToken, issueAccessToken } = require('../src/utils/tokens');
const { revokeSession } = require('../src/services/session.service');
const { createAuthRateLimiter } = require('../src/middleware/auth.middleware');
const password = 'Synthetic account password!';
const origin = process.env.AUTH_ALLOWED_ORIGINS;

test('authentication endpoints and session prerequisites preserve account isolation and manuscript behavior', { timeout: 1800000 }, async t => {
  const memory = await MongoMemoryServer.create({ instance: { dbName: 'human_testament_auth_test' } });
  assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
  let server;
  let clientIp, stepNumber = 0;
  // Simulate a controlled one-hop proxy; each scenario has an isolated client IP.
  // Do not mock Date.now globally: it also controls MongoDB driver deadlines.
  app.set('trust proxy', 1);
  const step = async (name, run) => { clientIp = `198.51.100.${++stepNumber}`; await t.test(name, run); };
  try {
    await mongoose.connect(memory.getUri(), { dbName: 'human_testament_auth_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage();
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { method = 'GET', body, headers = {}, token, cookie } = {}) {
      const response = await fetch(base + path, { method, signal: AbortSignal.timeout(15000), headers: {
        'X-Forwarded-For': clientIp,
        ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers,
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie'), headers: response.headers };
    }
    const post = (path, body, options) => request(`/api/auth/${path}`, { method: 'POST', body, ...options });
    const login = (email, options) => post('login', { email, password }, options);
    const cookieOf = result => result.cookie.split(';')[0];
    const rawOf = result => cookieOf(result).split('=')[1];
    let first, second, signedIn, otherLogin, secondDevice;

    await step('registration returns a safe unverified profile and persists only a bcrypt hash', async () => {
      const result = await post('register', { email: ' Reader@Example.TEST ', password, displayName: ' Reader One ' });
      assert.equal(result.status, 201); first = result.body.data.user;
      assert.deepEqual(Object.keys(first).sort(), ['id', 'email', 'displayName', 'role', 'emailVerified', 'isActive'].sort());
      assert.equal(first.email, 'reader@example.test'); assert.equal(first.displayName, 'Reader One');
      assert.equal(first.role, 'user'); assert.equal(first.emailVerified, false); assert.equal(first.isActive, true);
      assert.equal(result.cookie, null); assert.equal(result.headers.get('cache-control'), 'no-store');
      const stored = await User.findById(first.id).select('+passwordHash');
      assert.equal(await bcrypt.compare(password, stored.passwordHash), true);
      assert.equal(bcrypt.getRounds(stored.passwordHash), 12);
      assert.ok(!JSON.stringify(result.body).includes(stored.passwordHash));
      assert.ok(!JSON.stringify(await User.collection.findOne({ _id: stored._id })).includes(password));
      assert.equal(await RefreshSession.countDocuments(), 0);
    });

    await step('duplicate registrations and case variants return a consistent sanitized conflict', async () => {
      for (const email of ['reader@example.test', ' READER@EXAMPLE.TEST ']) {
        const result = await post('register', { email, password, displayName: 'Duplicate' });
        assert.equal(result.status, 409);
        assert.deepEqual(result.body, { success: false, message: 'An account with this email already exists.' });
      }
      assert.equal(await User.countDocuments(), 1);
    });

    await step('malformed inputs, password policy violations and privileged fields are rejected', async () => {
      const valid = { email: 'new@example.test', password, displayName: 'New Reader' };
      for (const body of [null, [], {}, { ...valid, email: 3 }, { ...valid, password: {} }, { ...valid, displayName: 12 },
        { ...valid, email: 'not-an-email' }, { ...valid, displayName: ' ' }, { ...valid, displayName: 'x'.repeat(81) },
        { ...valid, password: 'short' }, { ...valid, password: ' '.repeat(12) }, { ...valid, password: 'x'.repeat(73) },
        { ...valid, password: '界'.repeat(25) }, { ...valid, password: 'bad\npassword123' }]) {
        assert.equal((await post('register', body)).status, 400);
      }
    });

    await step('client-supplied privileged account fields are rejected', async () => {
      const valid = { email: 'new@example.test', password, displayName: 'New Reader' };
      for (const field of ['role', 'isActive', 'emailVerified', 'passwordHash', 'userId', 'passwordChangedAt', 'refreshToken']) {
        assert.equal((await post('register', { ...valid, [field]: 'client supplied' })).status, 400);
      }
      assert.equal(await User.countDocuments(), 1);
    });

    await step('login normalizes email and returns an access token with a secure cookie and hashed session', async () => {
      signedIn = await login(' READER@EXAMPLE.TEST '); assert.equal(signedIn.status, 200);
      assert.equal(signedIn.body.data.user.id, first.id); assert.equal(signedIn.body.data.expiresIn, 900);
      const claims = jwt.verify(signedIn.body.data.accessToken, process.env.AUTH_ACCESS_TOKEN_SECRET);
      assert.equal(claims.sub, first.id); assert.equal(claims.tokenUse, 'access');
      assert.equal(claims.exp - claims.iat, 900);
      assert.match(signedIn.cookie, /^__Secure-htt_refresh=/); assert.match(signedIn.cookie, /HttpOnly/i);
      assert.match(signedIn.cookie, /; Secure/i); assert.match(signedIn.cookie, /SameSite=Lax/i);
      assert.match(signedIn.cookie, /Path=\/api\/auth/); assert.ok(!/Domain=/i.test(signedIn.cookie));
      const raw = rawOf(signedIn);
      assert.match(raw, /^[A-Za-z0-9_-]{43}$/);
      assert.ok(!JSON.stringify(signedIn.body).includes(raw));
      const stored = await RefreshSession.findById(claims.sid).select('+tokenHash');
      assert.equal(String(stored.user), first.id); assert.equal(stored.revokedAt, null);
      assert.equal(stored.tokenHash, createHash('sha256').update(raw).digest('hex'));
      assert.ok(!JSON.stringify(stored).includes(stored.tokenHash));
      assert.ok(!JSON.stringify(await RefreshSession.collection.findOne({ _id: stored._id })).includes(raw));
      assert.ok(Math.abs(stored.expiresAt.getTime() - (Date.now() + 30 * 24 * 60 * 60 * 1000)) < 10000);
    });

    await step('wrong password, unknown email, invalid email and inactive accounts share one failure response', async () => {
      const expected = { success: false, message: 'Invalid email or password.' };
      const attempts = [
        { email: 'reader@example.test', password: 'incorrect password' },
        { email: 'unknown@example.test', password }, { email: 'invalid-email', password },
      ];
      for (const body of attempts) {
        const result = await post('login', body); assert.equal(result.status, 401); assert.deepEqual(result.body, expected);
        assert.equal(result.cookie, null);
      }
      const count = await RefreshSession.countDocuments();
      await User.updateOne({ _id: first.id }, { $set: { isActive: false } }, { runValidators: true });
      const inactive = await login(first.email); assert.equal(inactive.status, 401); assert.deepEqual(inactive.body, expected);
      assert.equal((await request('/api/auth/me', { token: signedIn.body.data.accessToken })).status, 401);
      await User.updateOne({ _id: first.id }, { $set: { isActive: true } }, { runValidators: true });
      assert.equal(await RefreshSession.countDocuments(), count);
      assert.equal((await post('login', { email: first.email, password, role: 'admin' })).status, 400);
    });

    await step('me derives identity from the signed token and ignores spoofed IDs in query/header data', async () => {
      signedIn = await login(first.email);
      const registered = await post('register', { email: 'second@example.test', password, displayName: 'Reader Two' });
      second = registered.body.data.user;
      const result = await request(`/api/auth/me?userId=${second.id}`, { token: signedIn.body.data.accessToken,
        headers: { 'X-User-Id': second.id, userId: second.id } });
      assert.equal(result.status, 200); assert.deepEqual(result.body.data.user, first);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(result.body.data.user.passwordHash, undefined);
      const alternateCase = await request('/API/AUTH/me', { token: signedIn.body.data.accessToken, headers: { Origin: origin } });
      assert.equal(alternateCase.status, 200);
      assert.equal(alternateCase.headers.get('access-control-allow-origin'), origin);
      assert.equal((await request('/api/auth/me')).status, 401);
      assert.equal((await request(`/api/auth/me?userId=${first.id}`, { cookie: cookieOf(signedIn) })).status, 401);
      assert.equal((await request('/api/auth/me', { headers: { 'X-User-Id': first.id } })).status, 401);
    });

    await step('expired, forged, wrong-algorithm, wrong-audience and wrong-issuer JWTs are rejected', async () => {
      signedIn = await login(first.email);
      const valid = jwt.decode(signedIn.body.data.accessToken);
      const sign = (payload = {}, options = {}, secret = process.env.AUTH_ACCESS_TOKEN_SECRET) => jwt.sign(
        { tokenUse: 'access', sid: valid.sid, pca: 0, ...payload }, secret,
        { algorithm: 'HS256', subject: first.id, issuer: 'human-testament-api', audience: 'human-testament-web', expiresIn: 900, ...options });
      const tokens = ['not-a-token', sign({}, { expiresIn: -1 }), sign({}, {}, randomBytes(48).toString('hex')),
        sign({}, { algorithm: 'HS384' }), sign({}, { audience: 'other' }), sign({}, { issuer: 'other' }),
        sign({ tokenUse: 'refresh' }), sign({ sid: 'invalid' }), sign({ iat: Math.floor(Date.now() / 1000) + 600 }),
        sign({}, { subject: second.id }), sign({}, { subject: first.id + '\n' }),
        sign({ sid: new mongoose.Types.ObjectId().toString() })];
      for (const token of tokens) assert.equal((await request('/api/auth/me', { token })).status, 401);
      const [header, payload, signature] = signedIn.body.data.accessToken.split('.');
      const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), sub: second.id })).toString('base64url');
      assert.equal((await request('/api/auth/me', { token: `${header}.${altered}.${signature}` })).status, 401);
    });

    await step('password changes and expired sessions invalidate access even before TTL cleanup', async () => {
      signedIn = await login(first.email);
      await User.updateOne({ _id: first.id }, { $set: { passwordChangedAt: new Date() } }, { runValidators: true });
      assert.equal((await request('/api/auth/me', { token: signedIn.body.data.accessToken })).status, 401);
      signedIn = await login(first.email);
      const claims = jwt.decode(signedIn.body.data.accessToken);
      await RefreshSession.updateOne({ _id: claims.sid }, { $set: { expiresAt: new Date(0) } }, { runValidators: true });
      assert.equal((await request('/api/auth/me', { token: signedIn.body.data.accessToken })).status, 401);
    });

    await step('logout revokes only the cookie-bound session and leaves other users/devices authenticated', async () => {
      signedIn = await login(first.email); secondDevice = await login(first.email); otherLogin = await login(second.email);
      const result = await post('logout', { userId: second.id, sessionId: jwt.decode(otherLogin.body.data.accessToken).sid },
        { cookie: cookieOf(signedIn), token: signedIn.body.data.accessToken });
      assert.equal(result.status, 200);
      const revoked = await RefreshSession.findById(jwt.decode(signedIn.body.data.accessToken).sid);
      assert.ok(revoked.revokedAt instanceof Date);
      assert.equal((await request('/api/auth/me', { token: signedIn.body.data.accessToken })).status, 401);
      assert.equal((await request('/api/auth/me', { token: otherLogin.body.data.accessToken })).body.data.user.id, second.id);
      assert.equal((await request('/api/auth/me', { token: secondDevice.body.data.accessToken })).body.data.user.id, first.id);
      assert.equal((await RefreshSession.findById(jwt.decode(otherLogin.body.data.accessToken).sid)).revokedAt, null);
    });

    await step('logout is idempotent and clears cookies with matching scope/security attributes', async () => {
      for (const cookie of [cookieOf(signedIn), undefined, '__Secure-htt_refresh=invalid',
        `${cookieOf(signedIn)}; ${cookieOf(otherLogin)}`]) {
        const result = await post('logout', {}, { cookie }); assert.equal(result.status, 200);
        assert.match(result.cookie, /^__Secure-htt_refresh=;/);
        for (const pattern of [/Path=\/api\/auth/, /HttpOnly/i, /; Secure/i, /SameSite=Lax/i, /Expires=Thu, 01 Jan 1970/i]) assert.match(result.cookie, pattern);
      }
      assert.equal((await RefreshSession.findById(jwt.decode(otherLogin.body.data.accessToken).sid)).revokedAt, null);
    });

    await step('origin and non-simple CSRF header checks protect login, registration and cookie-based logout', async () => {
      signedIn = await login(first.email);
      for (const endpoint of ['register', 'login', 'logout']) for (const headers of [
        { Origin: 'https://attacker.example.test' }, { Origin: 'null' }, { Origin: '' }, { 'X-CSRF-Protection': '' },
        { Origin: 'https://reader.example.test.attacker.test' },
      ]) {
        const result = await post(endpoint, {}, { headers, cookie: cookieOf(signedIn) }); assert.equal(result.status, 403);
      }
      assert.equal((await request('/api/auth/me', { token: signedIn.body.data.accessToken })).status, 200);
      const preflight = await fetch(base + '/api/auth/login', { method: 'OPTIONS', headers: {
        Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type,X-CSRF-Protection',
      } });
      assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
      const evil = await fetch(base + '/api/auth/login', { method: 'OPTIONS', headers: { Origin: 'https://attacker.test' } });
      assert.equal(evil.headers.get('access-control-allow-origin'), null);
    });

    await step('login is rate-limited per real client IP, including attempts with forged forwarding headers', async () => {
      app.set('trust proxy', false);
      try {
        for (let index = 0; index < 10; index++) assert.equal((await post('login', {}, { headers: { 'X-Forwarded-For': `198.51.100.${index}` } })).status, 400);
        const limited = await post('login', {}); assert.equal(limited.status, 429);
        assert.ok(Number(limited.headers.get('retry-after')) > 0);
      } finally { app.set('trust proxy', 1); }
    });

    await step('malformed JSON and wrong media types return safe errors without echoing request secrets', async () => {
      const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: {
        Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Protection': '1',
      }, body: '{"password":"do not echo this"' });
      assert.equal(response.status, 400); assert.deepEqual(await response.json(), { success: false, message: 'Invalid JSON request body.' });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await post('login', {}, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
    });

    await step('storage/index misconfiguration and missing signing configuration fail closed', async () => {
      await User.collection.dropIndex('user_email_unique');
      try { assert.equal((await login(first.email)).status, 503); }
      finally { await User.createIndexes(); }
      const previous = process.env.AUTH_ACCESS_TOKEN_SECRET;
      process.env.AUTH_ACCESS_TOKEN_SECRET = 'short';
      try { assert.equal((await login(first.email)).status, 503); }
      finally { process.env.AUTH_ACCESS_TOKEN_SECRET = previous; }
      process.env.AUTH_ENABLED = 'false';
      try { assert.equal((await request('/api/auth/me')).status, 503); }
      finally { process.env.AUTH_ENABLED = 'true'; }
      await assertAuthStorage();
    });

    await step('refresh primitives are random, hash-only, separately indexed and reject raw token fields', async () => {
      const a = createRefreshToken(), b = createRefreshToken(); assert.notEqual(a.token, b.token);
      assert.equal(validRefreshToken(a.token + '\n'), false);
      assert.equal(a.tokenHash, hashRefreshToken(a.token));
      assert.throws(() => new RefreshSession({ user: first.id, token: a.token, tokenHash: a.tokenHash, expiresAt: new Date() }), { name: 'StrictModeError' });
      const session = await RefreshSession.create({ user: first.id, tokenHash: a.tokenHash, expiresAt: new Date(Date.now() + 60000) });
      await assert.rejects(RefreshSession.create({ user: first.id, tokenHash: a.tokenHash, expiresAt: new Date(Date.now() + 60000) }), error => error.code === 11000);
      assert.equal('tokenHash' in await RefreshSession.findById(session._id).lean(), false);
      assert.equal('tokenHash' in session.toObject(), false);
      const indexes = await RefreshSession.collection.indexes();
      assert.ok(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
      const access = issueAccessToken(await User.findById(first.id), session._id, getAuthConfig());
      assert.equal((await request('/api/auth/me', { token: access })).status, 200);
      await revokeSession(a.token);
      assert.equal((await request('/api/auth/me', { token: access })).status, 401);
    });

    await step('the real frontend auth service completes register/login/me/logout through the mounted API', async () => {
      const { createApiClient } = await import('../../frontend/src/services/api/client.js');
      const { createAuthService } = await import('../../frontend/src/services/auth.service.js');
      let cookie;
      // Node has no browser cookie jar: simulate delivery, not browser policy.
      const client = createApiClient({ baseUrl: base, fetchImpl: async (url, init) => {
        const response = await fetch(url, { ...init, headers: { ...init.headers, Origin: origin,
          'X-Forwarded-For': clientIp, ...(cookie && init.credentials === 'include' ? { Cookie: cookie } : {}) } });
        const supplied = response.headers.get('set-cookie');
        if (supplied) cookie = supplied.split(';')[0];
        return response;
      } });
      const service = createAuthService(client);
      const registered = await service.register({ email: 'frontend@example.test', password, displayName: 'Frontend Reader' });
      assert.equal(registered.emailVerified, false);
      const loggedIn = await service.login({ email: registered.email, password });
      assert.equal(loggedIn.user.id, registered.id); assert.equal(loggedIn.accessToken, undefined);
      assert.equal((await service.getCurrentUser()).id, registered.id);
      await service.logout();
      await assert.rejects(service.getCurrentUser(), { status: 401 });
      assert.equal((await RefreshSession.findOne({ user: registered.id })).revokedAt instanceof Date, true);
    });

    await step('content and health remain publicly readable with authentication enabled', async () => {
      assert.equal((await request('/api/health')).status, 200);
      const verse = await request('/api/verses/freedom:10:14');
      assert.equal(verse.status, 200); assert.equal(verse.body.data.text, 'Responsibility is the shadow cast by freedom.');
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});

test('rate limiter has bounded memory and rejects requests when capacity is exhausted', () => {
  let clock = 0;
  const limiter = createAuthRateLimiter({ limit: 1, maxKeys: 1, windowMs: 1000, now: () => clock });
  const run = ip => { let error; limiter({ ip }, { set() {} }, value => { error = value; }); return error; };
  assert.equal(run('client-a'), undefined); assert.equal(run('client-a').status, 429); assert.equal(run('client-b').status, 429);
  clock = 1001;
  assert.equal(run('client-b'), undefined);
});

test('cookie configuration keeps production secure and permits HTTP only with an explicit loopback exception', () => {
  const saved = Object.fromEntries(['NODE_ENV', 'AUTH_ALLOWED_ORIGINS', 'AUTH_ALLOW_INSECURE_LOCALHOST', 'AUTH_COOKIE_SAME_SITE'].map(name => [name, process.env[name]]));
  try {
    process.env.AUTH_ALLOW_INSECURE_LOCALHOST = 'true';
    assert.throws(getAuthConfig, { status: 503 });
    process.env.NODE_ENV = 'development';
    process.env.AUTH_ALLOWED_ORIGINS = 'http://localhost:5173';
    assert.equal(getAuthConfig().cookieOptions.secure, false);
    assert.equal(getAuthConfig().cookieName, 'htt_refresh');
    process.env.AUTH_ALLOWED_ORIGINS = 'http://attacker.test'; assert.throws(getAuthConfig, { status: 503 });
    process.env.AUTH_ALLOWED_ORIGINS = 'http://localhost:5173';
    process.env.AUTH_COOKIE_SAME_SITE = 'none'; assert.throws(getAuthConfig, { status: 503 });
    delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
    process.env.AUTH_ALLOWED_ORIGINS = origin;
    assert.equal(getAuthConfig().cookieOptions.secure, true);
    assert.equal(getAuthConfig().cookieOptions.sameSite, 'none');
  } finally {
    for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
