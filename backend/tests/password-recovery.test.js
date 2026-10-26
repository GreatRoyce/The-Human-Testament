// Real transactions, synthetic identities, and an in-memory email double only.
// Never load .env, use Atlas, or send email from this test suite.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryReplSet, MongoMemoryServer } = require('mongodb-memory-server');
process.env.NODE_ENV = 'test';
process.env.CONTENT_SOURCE = 'pdf';
process.env.AUTH_ENABLED = 'true';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url');
process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test';
process.env.PASSWORD_RESET_FRONTEND_URL = 'https://reader.example.test';
process.env.PASSWORD_RESET_TTL_MINUTES = '30';
delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
delete process.env.AUTH_COOKIE_SAME_SITE;
delete process.env.MAIL_DELIVERY_ENABLED;
const app = require('../src/app');
const User = require('../src/models/User');
const Reset = require('../src/models/PasswordResetToken');
const RefreshSession = require('../src/models/RefreshSession');
const recovery = require('../src/services/passwordRecovery.service');
const email = require('../src/services/email.service');
const sessions = require('../src/services/session.service');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { getAuthConfig } = require('../src/config/auth');
const { getRecoveryConfig } = require('../src/config/passwordRecovery');
const { createOpaqueToken, hashOpaqueToken } = require('../src/utils/tokens');
const password = 'Synthetic original password!';
const nextPassword = 'Synthetic replacement password!';
const origin = process.env.AUTH_ALLOWED_ORIGINS;

test('password recovery and changes are single-use, transactional and isolated between accounts', { timeout: 1800000 }, async t => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ args: ['--setParameter', 'ttlMonitorEnabled=false'] }] });
  assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
  const outbox = [], logs = [];
  let deliveryStatus = 'accepted', throwMail = false, server, ip, scenario = 0, sequence = 0;
  t.mock.method(console, 'info', value => logs.push(JSON.stringify(value)));
  t.mock.method(console, 'error', value => logs.push(JSON.stringify(value)));
  t.mock.method(email, 'sendPasswordReset', async input => {
    outbox.push(input);
    if (throwMail) throw new Error('Provider rejected private details ' + input.link);
    return { status: deliveryStatus };
  });
  const step = async (name, callback) => { ip = `198.51.100.${++scenario}`; await t.test(name, callback); };
  try {
    await mongoose.connect(memory.getUri(), { dbName: 'human_testament_password_recovery_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage();
    const initialHash = await bcrypt.hash(password, 12);
    const makeUser = overrides => User.create({ email: `reader${++sequence}@example.test`, displayName: 'Synthetic Reader', passwordHash: initialHash, ...overrides });
    app.set('trust proxy', 1);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { body, token, headers = {}, method = 'POST' } = {}) {
      const response = await fetch(base + '/api/auth/' + path, { method, signal: AbortSignal.timeout(20000), headers: {
        Origin: origin, 'X-CSRF-Protection': '1', 'Content-Type': 'application/json', 'X-Forwarded-For': ip,
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
    }
    const forgot = (emailAddress, options) => request('forgot-password', { body: { email: emailAddress }, ...options });
    const reset = (token, newPassword = nextPassword, extra = {}) => request('reset-password', { body: { token, newPassword, passwordConfirmation: newPassword, ...extra } });
    const login = async (user, input = password) => {
      const result = await request('login', { body: { email: user.email, password: input } });
      assert.equal(result.status, 200); return result.body.data.accessToken;
    };
    const me = token => request('me', { method: 'GET', token });
    const issue = async user => {
      const count = outbox.length;
      const result = await forgot(' ' + user.email.toUpperCase() + ' '); assert.equal(result.status, 202);
      await recovery.drainDeliveries(); assert.equal(outbox.length, count + 1);
      const message = outbox.at(-1), url = new URL(message.link);
      const raw = new URLSearchParams(url.hash.slice(1)).get('token');
      assert.ok(!JSON.stringify(result.body).includes(raw));
      return { raw, message, record: await Reset.findOne({ tokenHash: hashOpaqueToken(raw, 'password-reset') }).select('+tokenHash') };
    };

    await step('known, unknown, verified and inactive accounts receive the same generic public response', async () => {
      const user = await makeUser(), verified = await makeUser({ emailVerified: true }), inactive = await makeUser({ isActive: false });
      const results = [];
      for (const address of [user.email, 'unknown@example.test', verified.email, inactive.email]) results.push(await forgot(address));
      await recovery.drainDeliveries();
      for (const result of results) { assert.equal(result.status, 202); assert.deepEqual(result.body, results[0].body); }
      assert.equal(outbox.filter(message => [user.email, verified.email].includes(message.to)).length, 2);
      assert.ok(!outbox.some(message => message.to === inactive.email));
      assert.ok(results[0].body.data.message.includes('attempt'));
    });

    await step('reset credentials are random, hash-only, expiring, serialized safely and bound to the trusted frontend', async () => {
      const user = await makeUser();
      const { raw, message, record } = await issue(user);
      assert.match(raw, /^[A-Za-z0-9_-]{43}$/); assert.match(record.tokenHash, /^[a-f0-9]{64}$/);
      assert.equal(record.tokenHash, hashOpaqueToken(raw, 'password-reset'));
      assert.notEqual(record.tokenHash, hashOpaqueToken(raw));
      assert.equal(message.to, user.email);
      const link = new URL(message.link); assert.equal(link.origin, origin); assert.equal(link.pathname, '/reset-password'); assert.equal(link.search, '');
      assert.equal(record.deliveryStatus, 'accepted'); assert.equal(record.usedAt, null);
      assert.ok(record.createdAt instanceof Date); assert.ok(Math.abs(record.expiresAt.getTime() - Date.now() - 30 * 60000) < 10000);
      assert.equal('tokenHash' in record.toJSON(), false); assert.equal('tokenHash' in record.toObject(), false);
      const stored = await Reset.collection.findOne({ _id: record._id }); assert.ok(!JSON.stringify(stored).includes(raw));
      assert.equal(User.schema.path('resetTokenHash'), undefined);
      assert.throws(() => new Reset({ user: user._id, token: raw, tokenHash: record.tokenHash, expiresAt: new Date() }), { name: 'StrictModeError' });
      await assert.rejects(Reset.create({ user: user._id, tokenHash: record.tokenHash, expiresAt: record.expiresAt }), error => error.code === 11000);
      const indexes = await Reset.collection.indexes(); assert.ok(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
      const another = await issue(user); assert.notEqual(another.raw, raw);
      assert.ok((await Reset.findById(record._id)).invalidatedAt instanceof Date);
      assert.equal((await reset(raw)).status, 400);
    });

    await step('invalid, unknown, expired and consumed credentials are rejected without relying on TTL deletion', async () => {
      const user = await makeUser();
      const tokens = [createOpaqueToken('password-reset'), createOpaqueToken('password-reset')];
      await Reset.create({ user: user._id, tokenHash: tokens[0].tokenHash, expiresAt: new Date(0), deliveryStatus: 'accepted' });
      await Reset.create({ user: user._id, tokenHash: tokens[1].tokenHash, expiresAt: new Date(Date.now() + 60000), usedAt: new Date(), deliveryStatus: 'accepted' });
      assert.equal(await Reset.countDocuments({ user: user._id }), 2);
      const results = [];
      for (const token of ['invalid', createOpaqueToken('password-reset').token, ...tokens.map(value => value.token)]) results.push(await reset(token));
      for (const result of results) { assert.equal(result.status, 400); assert.deepEqual(result.body, results[0].body); }
      assert.equal((await User.findById(user._id).select('+passwordHash')).passwordHash, initialHash);
    });

    await step('a successful reset changes only that account, consumes the token, revokes sessions and invalidates access', async () => {
      const user = await makeUser(), other = await makeUser();
      const access = await login(user), device = await login(user), otherAccess = await login(other);
      const issued = await issue(user), sibling = createOpaqueToken('password-reset');
      await Reset.create({ user: user._id, tokenHash: sibling.tokenHash, expiresAt: new Date(Date.now() + 60000), deliveryStatus: 'accepted' });
      const result = await reset(issued.raw); assert.equal(result.status, 200); assert.match(result.cookie, /HttpOnly/);
      const current = await User.findById(user._id).select('+passwordHash');
      assert.ok(current.passwordChangedAt instanceof Date); assert.equal(await bcrypt.compare(nextPassword, current.passwordHash), true);
      assert.equal(await bcrypt.compare(password, current.passwordHash), false); assert.equal(current.emailVerified, false);
      assert.ok((await Reset.findById(issued.record._id)).usedAt instanceof Date);
      assert.ok((await Reset.findOne({ tokenHash: sibling.tokenHash })).invalidatedAt instanceof Date);
      assert.equal(await RefreshSession.countDocuments({ user: user._id, revokedAt: null }), 0);
      assert.equal((await me(access)).status, 401); assert.equal((await me(device)).status, 401);
      assert.equal((await me(otherAccess)).status, 200);
      assert.equal((await reset(issued.raw)).status, 400); assert.equal((await reset(sibling.token)).status, 400);
      assert.equal((await request('login', { body: { email: user.email, password } })).status, 401);
      assert.equal((await me(await login(user, nextPassword))).status, 200);
      assert.ok(!JSON.stringify(result.body).includes(nextPassword)); assert.ok(!JSON.stringify(result.body).includes(issued.raw));
    });

    await step('concurrent consumption of the same token succeeds exactly once', async () => {
      const user = await makeUser(), { raw, record } = await issue(user);
      const choices = ['Concurrent password one!', 'Concurrent password two!'];
      const results = await Promise.all(choices.map(value => reset(raw, value)));
      assert.deepEqual(results.map(value => value.status).sort(), [200, 400]);
      const stored = await User.findById(user._id).select('+passwordHash');
      const winner = results.findIndex(value => value.status === 200);
      assert.equal(await bcrypt.compare(choices[winner], stored.passwordHash), true);
      assert.ok((await Reset.findById(record._id)).usedAt instanceof Date);
    });

    await step('different outstanding tokens cannot race to change the same account twice', async () => {
      const user = await makeUser(), first = await issue(user), second = createOpaqueToken('password-reset');
      await Reset.create({ user: user._id, tokenHash: second.tokenHash, expiresAt: new Date(Date.now() + 60000), deliveryStatus: 'accepted' });
      const results = await Promise.all([reset(first.raw), reset(second.token)]);
      assert.deepEqual(results.map(value => value.status).sort(), [200, 400]);
    });

    await step('a transaction failure rolls back token consumption, credential changes and session revocations', async sub => {
      const user = await makeUser(), access = await login(user), { raw, record } = await issue(user);
      sub.mock.method(sessions, 'revokeUserSessions', async () => { throw new Error('Private failure ' + raw); });
      const failed = await reset(raw); assert.equal(failed.status, 500);
      assert.deepEqual(failed.body, { success: false, message: 'An unexpected server error occurred.' });
      assert.equal((await Reset.findById(record._id)).usedAt, null);
      assert.equal((await User.findById(user._id).select('+passwordHash')).passwordHash, initialHash);
      assert.equal((await me(access)).status, 200);
      sub.mock.restoreAll();
      assert.equal((await reset(raw)).status, 200);
    });

    await step('password policy and confirmation are shared with registration and reject malformed requests', async () => {
      const user = await makeUser(), { raw } = await issue(user);
      for (const [index, body] of [null, [], {}, { token: raw, newPassword: 'short', passwordConfirmation: 'short' },
        { token: raw, newPassword: nextPassword, passwordConfirmation: 'different' },
        { token: raw, newPassword: '界'.repeat(25), passwordConfirmation: '界'.repeat(25) },
        { token: raw, newPassword: nextPassword, passwordConfirmation: nextPassword, userId: String(user._id) }].entries()) {
        assert.equal((await request('reset-password', { body, headers: { 'X-Forwarded-For': `203.0.113.${index}` } })).status, 400);
      }
      for (const body of [{}, { email: {} }, { email: 'bad' }, { email: user.email, redirect: 'https://attacker.test' }])
        assert.equal((await request('forgot-password', { body })).status, 400);
      assert.equal((await reset(raw)).status, 200);
    });

    await step('authenticated password changes require the current password and reject impersonation/reuse', async () => {
      const user = await makeUser(), other = await makeUser(), access = await login(user);
      const body = { currentPassword: password, newPassword: nextPassword, passwordConfirmation: nextPassword };
      assert.equal((await request('change-password', { body })).status, 401);
      assert.equal((await request('change-password', { token: access, body: { ...body, currentPassword: 'incorrect' } })).status, 400);
      assert.equal((await request('change-password', { token: access, body: { ...body, userId: String(other._id) } })).status, 400);
      assert.equal((await request('change-password', { token: access, body: { currentPassword: password, newPassword: password, passwordConfirmation: password } })).status, 400);
      // Use another client IP to test policy separately from the abuse counter.
      assert.equal((await request('change-password', { token: access, body: { ...body, passwordConfirmation: 'wrong' }, headers: { 'X-Forwarded-For': '203.0.113.90' } })).status, 400);
      assert.equal((await User.findById(other._id).select('+passwordHash')).passwordHash, initialHash);
      assert.equal((await me(access)).status, 200);
    });

    await step('change-password invalidates reset credentials, every user session and all previous access tokens', async () => {
      const user = await makeUser(), other = await makeUser();
      const access = await login(user), secondDevice = await login(user), otherAccess = await login(other), { raw } = await issue(user);
      const result = await request('change-password', { token: access, body: { currentPassword: password, newPassword: nextPassword, passwordConfirmation: nextPassword } });
      assert.equal(result.status, 200); assert.match(result.cookie, /Expires=Thu, 01 Jan 1970/);
      assert.equal((await me(access)).status, 401); assert.equal((await me(secondDevice)).status, 401); assert.equal((await me(otherAccess)).status, 200);
      assert.equal((await reset(raw)).status, 400); assert.equal(await RefreshSession.countDocuments({ user: user._id, revokedAt: null }), 0);
      assert.equal(await bcrypt.compare(nextPassword, (await User.findById(user._id).select('+passwordHash')).passwordHash), true);
      assert.equal((await me(await login(user, nextPassword))).status, 200);
    });

    await step('a delayed login with previously verified credentials cannot create a session after reset', async () => {
      const user = await makeUser(), stale = await User.findById(user._id).select('+passwordHash'), { raw } = await issue(user);
      assert.equal((await reset(raw)).status, 200);
      await assert.rejects(sessions.createSession(stale, getAuthConfig()), { status: 401 });
      assert.equal(await RefreshSession.countDocuments({ user: user._id }), 0);
    });

    await step('passwordChangedAt advances monotonically and invalidates tokens even with a future previous timestamp', async () => {
      const user = await makeUser({ passwordChangedAt: new Date(Date.now() + 20000) }), access = await login(user);
      const result = await request('change-password', { token: access, body: { currentPassword: password, newPassword: nextPassword, passwordConfirmation: nextPassword } });
      assert.equal(result.status, 200);
      assert.ok((await User.findById(user._id)).passwordChangedAt.getTime() > user.passwordChangedAt.getTime());
      assert.equal((await me(access)).status, 401);
    });

    await step('provider rejections, disabled delivery and thrown failures are never reported as delivery success', async () => {
      for (const [index, status] of ['failed', 'disabled', 'throw'].entries()) {
        const user = await makeUser(); deliveryStatus = status === 'throw' ? 'failed' : status; throwMail = status === 'throw';
        const headers = { 'X-Forwarded-For': `203.0.113.${70 + index}` };
        const result = await forgot(user.email, { headers }); await recovery.drainDeliveries();
        const unknown = await forgot(`unknown-${status}@example.test`, { headers });
        assert.equal(result.status, 202); assert.deepEqual(result.body, unknown.body);
        const record = await Reset.findOne({ user: user._id });
        assert.equal(record.deliveryStatus, status === 'disabled' ? 'disabled' : 'failed');
        assert.ok(record.invalidatedAt instanceof Date);
        const raw = new URLSearchParams(new URL(outbox.at(-1).link).hash.slice(1)).get('token');
        assert.equal((await reset(raw)).status, 400);
      }
      deliveryStatus = 'accepted'; throwMail = false;
    });

    await step('trusted link configuration is independent of request Host/redirect data and validates expiry bounds', async () => {
      const user = await makeUser();
      const result = await forgot(user.email, { headers: { Host: 'attacker.test', 'X-Forwarded-Host': 'attacker.test' } });
      assert.equal(result.status, 202); await recovery.drainDeliveries();
      assert.equal(new URL(outbox.at(-1).link).origin, origin);
      const previous = process.env.PASSWORD_RESET_FRONTEND_URL;
      process.env.PASSWORD_RESET_FRONTEND_URL = 'https://attacker.test';
      try {
        assert.throws(getRecoveryConfig, { status: 503 });
        const failed = await forgot((await makeUser()).email), unknown = await forgot('nobody-config@example.test');
        assert.deepEqual(failed.body, unknown.body);
      } finally { process.env.PASSWORD_RESET_FRONTEND_URL = previous; }
      const ttl = process.env.PASSWORD_RESET_TTL_MINUTES;
      process.env.PASSWORD_RESET_TTL_MINUTES = '2'; assert.throws(getRecoveryConfig, { status: 503 });
      process.env.PASSWORD_RESET_TTL_MINUTES = '15'; assert.equal(getRecoveryConfig().ttlMs, 15 * 60000);
      process.env.PASSWORD_RESET_TTL_MINUTES = ttl;
    });

    await step('forgot/reset/change retain CSRF defenses and IP/account rate limits', async () => {
      for (const route of ['forgot-password', 'reset-password', 'change-password']) {
        assert.equal((await request(route, { body: {}, headers: { Origin: 'https://attacker.test' } })).status, 403);
        assert.equal((await request(route, { body: {}, headers: { 'X-CSRF-Protection': '' } })).status, 403);
      }
      for (let index = 0; index < 5; index++) assert.equal((await forgot(`limit-${index}@example.test`)).status, 202);
      assert.equal((await forgot('limit-extra@example.test')).status, 429);
      for (let index = 0; index < 3; index++) assert.equal((await forgot('account-rate@example.test', { headers: { 'X-Forwarded-For': `203.0.113.${150 + index}` } })).status, 202);
      assert.equal((await forgot('account-rate@example.test', { headers: { 'X-Forwarded-For': '203.0.113.154' } })).status, 429);
      for (let index = 0; index < 10; index++) assert.equal((await reset('invalid')).status, 400);
      assert.equal((await reset('invalid')).status, 429);
      for (let index = 0; index < 5; index++) assert.equal((await request('change-password', { body: {} })).status, 401);
      assert.equal((await request('change-password', { body: {} })).status, 429);
    });

    await step('raw reset tokens, passwords and provider errors never appear in public responses or application logs', async () => {
      const combined = logs.join('\n');
      for (const message of outbox) {
        const raw = new URLSearchParams(new URL(message.link).hash.slice(1)).get('token');
        assert.ok(!combined.includes(raw)); assert.ok(!combined.includes(message.to));
      }
      assert.ok(!combined.includes(password)); assert.ok(!combined.includes(nextPassword));
      assert.ok(!combined.includes('Private failure')); assert.ok(!combined.includes('Provider rejected private details'));
    });
  } finally {
    await recovery.drainDeliveries();
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});

test('the email adapter requires explicit configuration, handles provider errors, and supports isolated test transports', async () => {
  const env = { NODE_ENV: 'test', MAIL_PROVIDER: 'resend', MAIL_DELIVERY_ENABLED: 'true',
    MAIL_FROM: 'Human Testament <sender@example.test>', RESEND_API_KEY: randomBytes(32).toString('hex') };
  const input = { to: 'synthetic@example.test', link: 'https://reader.example.test/reset-password#token=synthetic', minutes: 30 };
  const calls = [];
  const service = email.createEmailService({ env, fetchImpl: async (url, init) => {
    calls.push({ url, init }); return new Response(JSON.stringify({ id: 'synthetic-provider-id' }), { status: 200 });
  } });
  assert.deepEqual(await service.sendPasswordReset(input), { status: 'accepted' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  const body = JSON.parse(calls[0].init.body); assert.deepEqual(body.to, [input.to]); assert.ok(body.text.includes(input.link));
  assert.equal(body.from, env.MAIL_FROM);
  for (const response of [new Response('private provider error', { status: 403 }), new Response('{}', { status: 200 })]) {
    const rejected = email.createEmailService({ env, fetchImpl: async () => response });
    assert.deepEqual(await rejected.sendPasswordReset(input), { status: 'failed' });
  }
  assert.deepEqual(await email.createEmailService({ env }).sendPasswordReset(input), { status: 'disabled' });
  const disabled = email.createEmailService({ env: { ...env, MAIL_DELIVERY_ENABLED: 'false' }, fetchImpl: () => { throw new Error('Must not send.'); } });
  assert.deepEqual(await disabled.sendPasswordReset(input), { status: 'disabled' });
});

test('standalone MongoDB preserves core login but rejects credential mutations without partial writes', { timeout: 1800000 }, async t => {
  const memory = await MongoMemoryServer.create({ instance: { dbName: 'human_testament_standalone_recovery_test' } });
  let server;
  t.mock.method(console, 'info', () => {});
  try {
    await mongoose.connect(memory.getUri(), { dbName: 'human_testament_standalone_recovery_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage();
    const originalHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email: 'standalone@example.test', displayName: 'Standalone Reader', passwordHash: originalHash });
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function post(path, body, token) {
      const response = await fetch(base + '/api/auth/' + path, { method: 'POST', headers: {
        Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Protection': '1', 'X-Forwarded-For': '192.0.2.250',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    }
    const login = await post('login', { email: user.email, password }); assert.equal(login.status, 200);
    const changed = await post('change-password', { currentPassword: password, newPassword: nextPassword, passwordConfirmation: nextPassword }, login.body.data.accessToken);
    assert.equal(changed.status, 503);
    const reset = await post('reset-password', { token: createOpaqueToken('password-reset').token, newPassword: nextPassword, passwordConfirmation: nextPassword });
    assert.equal(reset.status, 503);
    assert.equal((await post('forgot-password', { email: user.email })).status, 202);
    assert.equal((await User.findById(user._id).select('+passwordHash')).passwordHash, originalHash);
    assert.equal(await Reset.countDocuments(), 0);
    assert.equal(await RefreshSession.countDocuments({ user: user._id, revokedAt: null }), 1);
  } finally {
    await recovery.drainDeliveries();
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});
