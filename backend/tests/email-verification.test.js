// Disposable loopback MongoDB only; no dotenv, Atlas, real identities or mail.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const express = require('express');
const { MongoMemoryReplSet, MongoMemoryServer } = require('mongodb-memory-server');
process.env.NODE_ENV = 'test';
process.env.CONTENT_SOURCE = 'pdf';
process.env.AUTH_ENABLED = 'true';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url');
process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test';
process.env.EMAIL_VERIFICATION_FRONTEND_URL = 'https://reader.example.test';
process.env.EMAIL_VERIFICATION_TTL_MINUTES = '1440';
process.env.PASSWORD_RESET_FRONTEND_URL = 'https://reader.example.test';
delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
delete process.env.AUTH_COOKIE_SAME_SITE;
delete process.env.MAIL_DELIVERY_ENABLED;
const app = require('../src/app');
const User = require('../src/models/User');
const Token = require('../src/models/EmailVerificationToken');
const Reset = require('../src/models/PasswordResetToken');
const RefreshSession = require('../src/models/RefreshSession');
const verification = require('../src/services/emailVerification.service');
const tokens = require('../src/services/accountToken.service');
const mail = require('../src/services/email.service');
const lifecycle = require('../src/services/accountLifecycle.service');
const sessions = require('../src/services/session.service');
const recovery = require('../src/services/passwordRecovery.service');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { getVerificationConfig } = require('../src/config/emailVerification');
const { getAuthConfig } = require('../src/config/auth');
const { authReady, authenticate, requireVerifiedEmail } = require('../src/middleware/auth.middleware');
const { createOpaqueToken, hashOpaqueToken } = require('../src/utils/tokens');
const password = 'Synthetic original passphrase!';
const nextPassword = 'Synthetic replacement passphrase!';
const origin = process.env.AUTH_ALLOWED_ORIGINS;

test('email ownership and account lifecycle preserve credential isolation and public reading', { timeout: 1800000 }, async t => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ args: ['--setParameter', 'ttlMonitorEnabled=false'] }] });
  assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
  const outbox = [], resetOutbox = [], logs = [], responses = [];
  let deliveryStatus = 'accepted', server, sequence = 0, requestNumber = 0;
  t.mock.method(console, 'info', value => logs.push(JSON.stringify(value)));
  t.mock.method(console, 'error', value => logs.push(JSON.stringify(value)));
  t.mock.method(mail, 'sendEmailVerification', async input => {
    outbox.push(input);
    if (deliveryStatus === 'throw') throw new Error('Private provider failure ' + input.link);
    return { status: deliveryStatus };
  });
  t.mock.method(mail, 'sendPasswordReset', async input => { resetOutbox.push(input); return { status: 'accepted' }; });
  try {
    await mongoose.connect(memory.getUri(), { dbName: 'human_testament_verification_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage();
    const hash = await bcrypt.hash(password, 12);
    const makeUser = overrides => User.create({ email: `verification${++sequence}@example.test`, displayName: 'Synthetic Reader', passwordHash: hash, ...overrides });
    // Exercise the exported ownership guard on a test-only feature; no new
    // product feature or verification gate is added to manuscript endpoints.
    const testApp = express();
    testApp.set('trust proxy', 1); app.set('trust proxy', 1);
    testApp.get('/verification-required', authReady, authenticate, requireVerifiedEmail,
      (req, res) => res.json({ success: true, data: { allowed: true } }));
    testApp.use(app);
    testApp.use(require('../src/middleware/error.middleware'));
    server = await new Promise(resolve => { const listener = testApp.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { body, token, headers = {}, method = 'POST', ip } = {}) {
      const response = await fetch(base + path, { method, signal: AbortSignal.timeout(20000), headers: {
        Origin: origin, 'X-CSRF-Protection': '1', 'Content-Type': 'application/json',
        'X-Forwarded-For': ip ?? `198.51.${Math.floor(++requestNumber / 250)}.${requestNumber % 250 + 1}`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const result = { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
      responses.push(JSON.stringify(result)); return result;
    }
    const post = (path, body, options = {}) => request('/api/auth/' + path, { ...options, body });
    const resend = (email, options) => post('resend-verification', { email }, options);
    const verify = (token, options) => post('verify-email', { token }, options);
    const me = token => request('/api/auth/me', { method: 'GET', token });
    const feature = token => request('/verification-required', { method: 'GET', token });
    const rawFrom = message => new URLSearchParams(new URL(message.link).hash.slice(1)).get('token');
    const issue = async user => {
      const before = outbox.length;
      assert.equal((await resend(' ' + user.email.toUpperCase() + ' ')).status, 202);
      await tokens.drainDeliveries(); assert.equal(outbox.length, before + 1);
      const message = outbox.at(-1), raw = rawFrom(message);
      return { raw, message, record: await Token.findOne({ tokenHash: hashOpaqueToken(raw, 'email-verification') }).select('+tokenHash') };
    };
    const login = async user => {
      const result = await post('login', { email: user.email, password });
      assert.equal(result.status, 200); return result.body.data.accessToken;
    };

    await t.test('registration triggers verification without marking ownership or creating a session', async () => {
      const result = await post('register', { email: 'new-registration@example.test', displayName: 'New Reader', password });
      assert.equal(result.status, 201); assert.equal(result.body.data.user.emailVerified, false);
      assert.equal(result.cookie, null); await tokens.drainDeliveries();
      assert.equal(outbox.at(-1).to, 'new-registration@example.test');
      const record = await Token.findOne({ user: result.body.data.user.id });
      assert.equal(record.deliveryStatus, 'accepted'); assert.equal(await RefreshSession.countDocuments(), 0);
    });
    await t.test('credentials are random, hashed, expiring, purpose-separated and protected by unique/TTL indexes', async () => {
      const user = await makeUser(), { raw, record, message } = await issue(user);
      assert.match(raw, /^[A-Za-z0-9_-]{43}$/); assert.match(record.tokenHash, /^[a-f0-9]{64}$/);
      assert.notEqual(record.tokenHash, hashOpaqueToken(raw, 'password-reset'));
      assert.notEqual(record.tokenHash, hashOpaqueToken(raw));
      assert.ok(record.createdAt instanceof Date); assert.equal(record.usedAt, null);
      assert.ok(Math.abs(record.expiresAt.getTime() - Date.now() - 1440 * 60000) < 10000);
      assert.equal('tokenHash' in record.toJSON(), false); assert.equal('tokenHash' in record.toObject(), false);
      assert.equal('tokenHash' in await Token.findById(record._id).lean(), false);
      assert.ok(!JSON.stringify(await Token.collection.findOne({ _id: record._id })).includes(raw));
      assert.equal(User.schema.path('verificationToken'), undefined);
      assert.throws(() => new Token({ user: user._id, token: raw, tokenHash: record.tokenHash, expiresAt: new Date() }), { name: 'StrictModeError' });
      await assert.rejects(Token.create({ user: user._id, tokenHash: record.tokenHash, expiresAt: record.expiresAt }), error => error.code === 11000);
      await assert.rejects(new Token({}).validate(), { name: 'ValidationError' });
      await assert.rejects(new Token({ user: user._id, tokenHash: 'a'.repeat(63) + '\n', expiresAt: new Date() }).validate(), { name: 'ValidationError' });
      const indexes = await Token.collection.indexes();
      assert.ok(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
      const url = new URL(message.link); assert.equal(url.origin, origin); assert.equal(url.pathname, '/verify-email'); assert.equal(url.search, '');
    });
    await t.test('existing, absent, verified and inactive accounts get the same resend response', async () => {
      const active = await makeUser(), verified = await makeUser({ emailVerified: true }), inactive = await makeUser({ isActive: false });
      const results = [];
      for (const address of [active.email, 'absent@example.test', verified.email, inactive.email]) results.push(await resend(address));
      await tokens.drainDeliveries();
      for (const result of results) { assert.equal(result.status, 202); assert.deepEqual(result.body, results[0].body); }
      assert.equal(outbox.filter(message => message.to === active.email).length, 1);
      assert.ok(!outbox.some(message => [verified.email, inactive.email].includes(message.to)));
      assert.equal((await User.findById(inactive._id)).isActive, false);
    });
    await t.test('unknown, malformed, expired, used and pending tokens fail without relying on TTL cleanup', async () => {
      const user = await makeUser();
      const credentials = [createOpaqueToken('email-verification'), createOpaqueToken('email-verification'), createOpaqueToken('email-verification')];
      await Token.create([
        { user: user._id, tokenHash: credentials[0].tokenHash, expiresAt: new Date(0), deliveryStatus: 'accepted' },
        { user: user._id, tokenHash: credentials[1].tokenHash, expiresAt: new Date(Date.now() + 60000), deliveryStatus: 'accepted', usedAt: new Date() },
        { user: user._id, tokenHash: credentials[2].tokenHash, expiresAt: new Date(Date.now() + 60000) },
      ]);
      assert.equal(await Token.countDocuments({ user: user._id }), 3);
      let expected;
      for (const raw of ['bad', createOpaqueToken('email-verification').token, ...credentials.map(value => value.token)]) {
        const result = await verify(raw); assert.equal(result.status, 400);
        expected ??= result.body; assert.deepEqual(result.body, expected);
      }
      assert.equal((await User.findById(user._id)).emailVerified, false);
    });
    await t.test('successful verification changes only email ownership, invalidates siblings and rejects reuse', async () => {
      const user = await makeUser(), other = await makeUser(), access = await login(user);
      const { raw, record } = await issue(user), sibling = createOpaqueToken('email-verification');
      await Token.create({ user: user._id, tokenHash: sibling.tokenHash, expiresAt: new Date(Date.now() + 60000), deliveryStatus: 'accepted' });
      assert.equal((await verify(raw)).status, 200);
      const current = await User.findById(user._id).select('+passwordHash');
      assert.equal(current.emailVerified, true); assert.equal(current.passwordHash, hash);
      assert.equal(current.email, user.email); assert.equal(current.role, 'user'); assert.equal(current.isActive, true); assert.equal(current.passwordChangedAt, undefined);
      assert.equal((await User.findById(other._id)).emailVerified, false);
      assert.ok((await Token.findById(record._id)).usedAt instanceof Date);
      assert.ok((await Token.findOne({ tokenHash: sibling.tokenHash })).invalidatedAt instanceof Date);
      assert.equal((await verify(raw)).status, 400); assert.equal((await verify(sibling.token)).status, 400);
      assert.equal((await me(access)).body.data.user.emailVerified, true);
      assert.equal((await feature(access)).status, 200);
    });
    await t.test('concurrent requests can consume the same verification token exactly once', async () => {
      const user = await makeUser(), { raw } = await issue(user);
      const results = await Promise.all([verify(raw), verify(raw), verify(raw)]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 400, 400]);
    });
    await t.test('different tokens for one account cannot both verify it concurrently', async () => {
      const user = await makeUser(), first = await issue(user), second = createOpaqueToken('email-verification');
      await Token.create({ user: user._id, tokenHash: second.tokenHash, expiresAt: new Date(Date.now() + 60000), deliveryStatus: 'accepted' });
      const results = await Promise.all([verify(first.raw), verify(second.token)]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
    });
    await t.test('replacement invalidates older links and concurrent resends leave at most one usable link', async () => {
      const user = await makeUser(), first = await issue(user);
      await Promise.all([resend(user.email), resend(user.email)]); await tokens.drainDeliveries();
      assert.ok((await Token.findById(first.record._id)).invalidatedAt instanceof Date);
      assert.equal((await verify(first.raw)).status, 400);
      assert.equal(await Token.countDocuments({ user: user._id, usedAt: null, invalidatedAt: null, deliveryStatus: 'accepted' }), 1);
    });
    await t.test('transaction failure rolls back ownership and token consumption together', async sub => {
      const user = await makeUser(), { raw, record } = await issue(user);
      const original = tokens.invalidateTokens;
      sub.mock.method(tokens, 'invalidateTokens', async (Model, ...args) => {
        if (Model === Token) throw new Error('Private transaction failure ' + raw);
        return original(Model, ...args);
      });
      const result = await verify(raw); assert.equal(result.status, 500);
      assert.equal((await User.findById(user._id)).emailVerified, false);
      assert.equal((await Token.findById(record._id)).usedAt, null);
      sub.mock.restoreAll(); assert.equal((await verify(raw)).status, 200);
    });
    await t.test('unverified users can log in/read/manage credentials but ownership-required guards reject them', async () => {
      const user = await makeUser(), access = await login(user);
      assert.equal((await me(access)).status, 200); assert.equal((await feature(access)).status, 403);
      assert.equal((await feature(undefined)).status, 401);
      const verse = await request('/api/verses/freedom:10:14', { method: 'GET' });
      assert.equal(verse.status, 200); assert.equal(verse.body.data.text, 'Responsibility is the shadow cast by freedom.');
      assert.equal((await request('/api/verses/freedom:10:14', { method: 'GET', token: access })).status, 200);
    });
    await t.test('password reset neither verifies email nor consumes independent verification credentials', async () => {
      const user = await makeUser(), { raw } = await issue(user);
      assert.equal((await post('forgot-password', { email: user.email })).status, 202); await tokens.drainDeliveries();
      const resetRaw = rawFrom(resetOutbox.at(-1));
      assert.equal((await verify(resetRaw)).status, 400);
      const body = token => ({ token, newPassword: nextPassword, passwordConfirmation: nextPassword });
      assert.equal((await post('reset-password', body(raw))).status, 400);
      assert.equal((await post('reset-password', body(resetRaw))).status, 200);
      assert.equal((await User.findById(user._id)).emailVerified, false);
      assert.equal((await verify(raw)).status, 200);
    });
    await t.test('deactivation revokes every session and both credential purposes, and blocks inactive accounts', async () => {
      const user = await makeUser(), other = await makeUser();
      const stale = await User.findById(user._id).select('+passwordHash');
      const access = await login(user), secondDevice = await login(user), otherAccess = await login(other);
      const { raw } = await issue(user);
      await recovery.forgotPassword({ email: user.email }); await tokens.drainDeliveries();
      const resetRaw = rawFrom(resetOutbox.at(-1));
      assert.deepEqual(await lifecycle.setAccountActive(user._id, false), { id: String(user._id), isActive: false });
      assert.equal(await RefreshSession.countDocuments({ user: user._id, revokedAt: null }), 0);
      assert.equal((await me(access)).status, 401); assert.equal((await me(secondDevice)).status, 401);
      assert.equal((await feature(access)).status, 401); assert.equal((await me(otherAccess)).status, 200);
      assert.equal((await post('login', { email: user.email, password })).status, 401);
      await assert.rejects(sessions.createSession(stale, getAuthConfig()), { status: 401 });
      assert.equal((await verify(raw)).status, 400);
      assert.equal((await post('reset-password', { token: resetRaw, newPassword: nextPassword, passwordConfirmation: nextPassword })).status, 400);
      const before = outbox.length; assert.equal((await resend(user.email)).status, 202); await tokens.drainDeliveries(); assert.equal(outbox.length, before);
      assert.equal((await request('/api/verses/freedom:10:14', { method: 'GET', token: access })).status, 200);
      await lifecycle.setAccountActive(user._id, true);
      assert.equal((await me(access)).status, 401); assert.equal((await verify(raw)).status, 400);
      assert.equal((await me(await login(user))).status, 200);
      assert.equal((await User.findById(user._id)).emailVerified, false);
      assert.equal((await post('deactivate', { userId: String(other._id) })).status, 404);
      assert.equal((await post('reactivate', { userId: String(user._id) })).status, 404);
    });
    await t.test('deactivation rolls back all changes on failure and rejects malformed administrative input', async sub => {
      const user = await makeUser(), access = await login(user), { raw } = await issue(user);
      sub.mock.method(sessions, 'revokeUserSessions', async () => { throw new Error('Private admin failure'); });
      await assert.rejects(lifecycle.setAccountActive(user._id, false));
      assert.equal((await User.findById(user._id)).isActive, true); assert.equal((await me(access)).status, 200);
      sub.mock.restoreAll(); assert.equal((await verify(raw)).status, 200);
      await assert.rejects(lifecycle.setAccountActive('bad', false), { status: 400 });
      await assert.rejects(lifecycle.setAccountActive(user._id, 'false'), { status: 400 });
      await assert.rejects(lifecycle.setAccountActive(new mongoose.Types.ObjectId(), false), { status: 404 });
    });
    await t.test('provider failures and disabled mail remain account-neutral and never create a usable token', async () => {
      for (const status of ['failed', 'disabled', 'throw']) {
        const user = await makeUser(); deliveryStatus = status;
        const known = await resend(user.email), unknown = await resend(`absent-${status}@example.test`);
        assert.equal(known.status, 202); assert.deepEqual(known.body, unknown.body); await tokens.drainDeliveries();
        const record = await Token.findOne({ user: user._id });
        assert.equal(record.deliveryStatus, status === 'disabled' ? 'disabled' : 'failed'); assert.ok(record.invalidatedAt instanceof Date);
        assert.equal((await verify(rawFrom(outbox.at(-1)))).status, 400);
      }
      deliveryStatus = 'failed';
      const registered = await post('register', { email: 'delivery-failed-registration@example.test', password, displayName: 'Reader' });
      assert.equal(registered.status, 201); assert.equal(registered.body.data.user.emailVerified, false);
      await tokens.drainDeliveries(); deliveryStatus = 'accepted';
    });
    await t.test('trusted origin and expiry configuration reject redirects, paths and invalid bounds', async () => {
      const user = await makeUser();
      await resend(user.email, { headers: { Host: 'attacker.test', 'X-Forwarded-Host': 'attacker.test' } }); await tokens.drainDeliveries();
      assert.equal(new URL(outbox.at(-1).link).origin, origin);
      const originalUrl = process.env.EMAIL_VERIFICATION_FRONTEND_URL, ttl = process.env.EMAIL_VERIFICATION_TTL_MINUTES;
      try {
        for (const url of ['https://attacker.test', origin + '/redirect', origin + '?next=evil', origin + '#evil']) {
          process.env.EMAIL_VERIFICATION_FRONTEND_URL = url; assert.throws(getVerificationConfig, { status: 503 });
        }
        const result = await resend(user.email); assert.equal(result.status, 202);
        process.env.EMAIL_VERIFICATION_FRONTEND_URL = originalUrl;
        for (const minutes of ['0', '4', '1441', 'NaN', '5.5']) { process.env.EMAIL_VERIFICATION_TTL_MINUTES = minutes; assert.throws(getVerificationConfig, { status: 503 }); }
        process.env.EMAIL_VERIFICATION_TTL_MINUTES = '15'; assert.equal(getVerificationConfig().ttlMs, 15 * 60000);
      } finally { process.env.EMAIL_VERIFICATION_FRONTEND_URL = originalUrl; process.env.EMAIL_VERIFICATION_TTL_MINUTES = ttl; }
    });
    await t.test('malformed and privileged inputs are rejected and CSRF/origin protections are retained', async () => {
      for (const body of [null, [], {}, { token: {} }, { token: 'x', userId: 'other' }, { token: 'x', emailVerified: true }])
        assert.equal((await post('verify-email', body)).status, 400);
      for (const body of [null, {}, { email: [] }, { email: 'bad' }, { email: 'valid@example.test', redirect: 'https://attacker.test' }, { email: 'valid@example.test', isActive: true }])
        assert.equal((await post('resend-verification', body)).status, 400);
      for (const route of ['verify-email', 'resend-verification']) {
        assert.equal((await post(route, {}, { headers: { Origin: 'https://attacker.test' } })).status, 403);
        assert.equal((await post(route, {}, { headers: { 'X-CSRF-Protection': '' } })).status, 403);
        assert.equal((await post(route, {}, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
      }
    });
    await t.test('resend limits both IP and normalized email, including nonexistent accounts; verification limits IP', async () => {
      for (let i = 0; i < 5; i++) assert.equal((await resend(`ip-rate-${i}@example.test`, { ip: '192.0.2.20' })).status, 202);
      assert.equal((await resend('ip-rate-extra@example.test', { ip: '192.0.2.20' })).status, 429);
      for (let i = 0; i < 3; i++) assert.equal((await resend(' Email-Rate@Example.TEST ')).status, 202);
      assert.equal((await resend('email-rate@example.test')).status, 429);
      for (let i = 0; i < 10; i++) assert.equal((await verify('bad', { ip: '192.0.2.21' })).status, 400);
      assert.equal((await verify('bad', { ip: '192.0.2.21' })).status, 429);
    });
    await t.test('missing verification indexes fail closed without blocking ordinary authentication', async () => {
      const user = await makeUser(), access = await login(user), { raw } = await issue(user);
      await Token.collection.dropIndex('email_verification_hash_unique');
      try {
        assert.equal((await verify(raw)).status, 503); assert.equal((await resend(user.email)).status, 202);
        assert.equal((await me(access)).status, 200); assert.equal((await User.findById(user._id)).emailVerified, false);
      } finally { await Token.createIndexes(); }
      assert.equal((await verify(raw)).status, 200);
    });
    await t.test('no raw verification/reset tokens, passwords, recipients or provider errors appear in responses/logs', () => {
      const publicOutput = responses.join('\n') + logs.join('\n');
      for (const message of [...outbox, ...resetOutbox]) assert.ok(!publicOutput.includes(rawFrom(message)));
      assert.ok(!publicOutput.includes(password)); assert.ok(!publicOutput.includes(nextPassword));
      const logging = logs.join('\n');
      for (const message of outbox) assert.ok(!logging.includes(message.to));
      assert.ok(!logging.includes('Private provider failure')); assert.ok(!logging.includes('Private transaction failure'));
    });
  } finally {
    await tokens.drainDeliveries(); if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});

test('verification uses the existing provider adapter and keeps real network delivery disabled under test', async () => {
  const env = { NODE_ENV: 'test', MAIL_PROVIDER: 'resend', MAIL_DELIVERY_ENABLED: 'true',
    MAIL_FROM: 'sender@example.test', RESEND_API_KEY: randomBytes(32).toString('hex') };
  const input = { to: 'synthetic@example.test', link: origin + '/verify-email#token=synthetic', minutes: 1440 };
  const calls = [];
  const sender = mail.createEmailService({ env, fetchImpl: async (url, init) => {
    calls.push({ url, init }); return new Response(JSON.stringify({ id: 'fake-provider-id' }), { status: 200 });
  } });
  assert.deepEqual(await sender.sendEmailVerification(input), { status: 'accepted' });
  const message = JSON.parse(calls[0].init.body);
  assert.deepEqual(message.to, [input.to]); assert.ok(message.text.includes(input.link)); assert.match(message.subject, /Verify/);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(await mail.createEmailService({ env }).sendEmailVerification(input), { status: 'disabled' });
  const rejected = mail.createEmailService({ env, fetchImpl: async () => new Response('private', { status: 403 }) });
  assert.deepEqual(await rejected.sendEmailVerification(input), { status: 'failed' });
});

test('standalone MongoDB refuses verification and lifecycle writes without partially changing accounts', { timeout: 1800000 }, async t => {
  const memory = await MongoMemoryServer.create();
  t.mock.method(console, 'info', () => {});
  try {
    await mongoose.connect(memory.getUri(), { dbName: 'human_testament_standalone_verification_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage();
    const user = await User.create({ email: 'standalone@example.test', displayName: 'Reader', passwordHash: await bcrypt.hash(password, 12) });
    assert.deepEqual(await verification.resendVerification({ email: user.email }), { message: verification.genericMessage });
    await assert.rejects(verification.verifyEmail({ token: createOpaqueToken('email-verification').token }), { status: 503 });
    await assert.rejects(lifecycle.setAccountActive(user._id, false), { status: 503 });
    assert.equal(await Token.countDocuments(), 0);
    const current = await User.findById(user._id); assert.equal(current.isActive, true); assert.equal(current.emailVerified, false);
  } finally { await tokens.drainDeliveries(); await mongoose.disconnect(); await memory.stop(); }
});
