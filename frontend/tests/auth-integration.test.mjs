// Real frontend HTTP transport + backend routes + isolated transactional MongoDB.
// No local .env, Atlas connection, Gmail credentials, or real email delivery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { createApiClient } from '../src/services/api/client.js';
import { createAuthService } from '../src/services/auth.service.js';
import { readAccountToken } from '../src/features/auth/resetLink.js';

const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
const mongoose = backendRequire('mongoose');
const { MongoMemoryReplSet } = backendRequire('mongodb-memory-server');
const frontendOrigin = 'http://localhost:5173';

test('frontend account services complete registration, verification, and password reset over real HTTP', { timeout: 180000 }, async t => {
  Object.assign(process.env, {
    NODE_ENV: 'test', CONTENT_SOURCE: 'pdf', AUTH_ENABLED: 'true',
    AUTH_ACCESS_TOKEN_SECRET: randomBytes(48).toString('base64url'), AUTH_ALLOWED_ORIGINS: frontendOrigin,
    AUTH_ALLOW_INSECURE_LOCALHOST: 'true', AUTH_COOKIE_SAME_SITE: 'lax', AUTH_TRUST_PROXY_HOPS: '0',
    PASSWORD_RESET_FRONTEND_URL: frontendOrigin, EMAIL_VERIFICATION_FRONTEND_URL: frontendOrigin,
    MAIL_DELIVERY_ENABLED: 'false', COMMUNITY_POSTING_ENABLED: 'false', ADMINISTRATION_ENABLED: 'false', ANALYTICS_ENABLED: 'false',
  });
  const mail = backendRequire('./src/services/email.service');
  const verification = backendRequire('./src/services/emailVerification.service');
  const recovery = backendRequire('./src/services/passwordRecovery.service');
  const outbox = [];
  t.mock.method(mail, 'sendEmailVerification', async message => { outbox.push({ purpose: 'verification', ...message }); return { status: 'accepted' }; });
  t.mock.method(mail, 'sendPasswordReset', async message => { outbox.push({ purpose: 'reset', ...message }); return { status: 'accepted' }; });
  t.mock.method(console, 'info', () => {});
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  let server;
  try {
    const uri = memory.getUri();
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
    await mongoose.connect(uri, { dbName: 'htt_frontend_auth_integration', autoCreate: false, autoIndex: false });
    await backendRequire('./src/services/authStorage').initializeAuthStorage();
    await backendRequire('./src/services/notificationStorage').initializeNotificationStorage();
    const app = backendRequire('./src/app');
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    // Browsers add Origin automatically; Node's fetch needs it explicitly.
    const requests = [];
    const fetchImpl = (url, init) => {
      requests.push({ path: new URL(url).pathname, credentials: init.credentials });
      return fetch(url, { ...init, headers: { ...init.headers, Origin: frontendOrigin } });
    };
    const client = createApiClient({ baseUrl, fetchImpl });
    const auth = createAuthService(client), secondSession = createAuthService(client);
    const email = 'integration-reader@example.test';
    const password = 'Synthetic original passphrase!';
    const replacement = 'Synthetic replacement passphrase!';

    await t.test('local preflight permits the configured frontend and refuses an unrelated origin', async () => {
      const options = { method: 'OPTIONS', headers: { Origin: frontendOrigin,
        'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-protection' } };
      const allowed = await fetch(baseUrl + '/api/auth/register', options);
      assert.equal(allowed.headers.get('access-control-allow-origin'), frontendOrigin);
      assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
      const denied = await fetch(baseUrl + '/api/auth/register', { ...options,
        headers: { ...options.headers, Origin: 'https://unrelated.example.test' } });
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
    });

    let verificationToken;
    await t.test('registration issues a link to the frontend and verification updates the account', async () => {
      const registered = await auth.register({ email, displayName: 'Integration Reader', password });
      assert.equal(registered.emailVerified, false);
      await verification.drainDeliveries();
      const message = outbox.find(item => item.purpose === 'verification');
      assert.equal(message.to, email);
      const url = new URL(message.link);
      assert.equal(url.origin, frontendOrigin); assert.equal(url.pathname, '/verify-email');
      assert.equal(url.search, ''); verificationToken = readAccountToken(url);
      assert.equal(verificationToken.length, 43);
      assert.match((await auth.verifyEmail({ token: verificationToken })).message, /verified/i);
      await auth.login({ email, password });
      assert.equal((await auth.getCurrentUser()).emailVerified, true);
      await assert.rejects(auth.verifyEmail({ token: verificationToken }), { status: 400 });
    });

    await t.test('reset changes the password, rejects token reuse, and revokes the other session', async () => {
      await secondSession.login({ email, password });
      await auth.forgotPassword({ email }); await recovery.drainDeliveries();
      const message = outbox.find(item => item.purpose === 'reset');
      assert.equal(message.to, email);
      const url = new URL(message.link);
      assert.equal(url.origin, frontendOrigin); assert.equal(url.pathname, '/reset-password');
      const resetToken = readAccountToken(url); assert.equal(resetToken.length, 43);
      const body = { token: resetToken, newPassword: replacement, passwordConfirmation: replacement };
      await auth.resetPassword(body);
      await assert.rejects(auth.getCurrentUser(), { status: 401 });
      await assert.rejects(secondSession.getCurrentUser(), { status: 401 });
      await assert.rejects(auth.resetPassword(body), { status: 400 });
      await assert.rejects(auth.login({ email, password }), { status: 401 });
      await auth.login({ email, password: replacement });
      assert.equal((await auth.getCurrentUser()).emailVerified, true);
      await auth.logout();
      await assert.rejects(auth.getCurrentUser(), { status: 401 });
    });
    assert.ok(requests.length > 0);
    assert.ok(requests.every(request => request.credentials === 'include'));
  } finally {
    await Promise.all([verification.drainDeliveries(), recovery.drainDeliveries()]);
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await mongoose.disconnect(); await memory.stop();
  }
});
