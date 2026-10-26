// No .env, Atlas connection, credentials, or email delivery in these tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const express = require('express');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const { validateRuntime, supportedRuntime } = require('../src/config/runtime');
const { createReadinessHandler, assertRuntimeReady } = require('../src/services/runtimeReadiness');
process.env.NODE_ENV = 'test';
process.env.AUTH_ENABLED = 'false';
process.env.CONTENT_SOURCE = 'pdf';
const app = require('../src/app');
const patchedNode = '22.23.4';

test('production configuration rejects unsafe runtime, secrets, feature dependencies, and missing mail', () => {
  const base = { NODE_ENV: 'production', CONTENT_SOURCE: 'pdf' };
  assert.equal(validateRuntime(base, patchedNode).database, false);
  assert.equal(supportedRuntime('22.16.0'), false);
  for (const version of ['22.23.4', '24.22.1', '26.12.1']) assert.equal(supportedRuntime(version), true);
  const invalid = [
    [{ ...base }, '22.16.0', 'NODE_SECURITY_UPDATE_REQUIRED'],
    [{ ...base, NODE_ENV: 'prod' }, patchedNode, 'NODE_ENV_INVALID'],
    [{ ...base, PORT: 'pipe-name' }, patchedNode, 'PORT_INVALID'],
    [{ ...base, AUTH_TRUST_PROXY_HOPS: 'true' }, patchedNode, 'TRUST_PROXY_INVALID'],
    [{ ...base, AUTH_ENABLED: 'TRUE' }, patchedNode, 'FEATURE_FLAG_INVALID'],
    [{ ...base, ADMINISTRATION_ENABLED: 'true' }, patchedNode, 'AUTH_REQUIRED'],
    [{ ...base, ANALYTICS_ENABLED: 'true' }, patchedNode, 'DATABASE_CONFIGURATION_INVALID'],
  ];
  for (const [env, version, code] of invalid) assert.throws(() => validateRuntime(env, version), { code });
  const account = { ...base, AUTH_ENABLED: 'true', AUTH_ACCESS_TOKEN_SECRET: randomBytes(48).toString('base64url'),
    AUTH_ALLOWED_ORIGINS: 'https://reader.example.test', MONGODB_URI: 'mongodb://127.0.0.1/accounts' };
  assert.throws(() => validateRuntime(account, patchedNode), { code: 'ACCOUNT_MAIL_REQUIRED' });
  assert.throws(() => validateRuntime({ ...account, AUTH_ACCESS_TOKEN_SECRET: 'development-secret-'.repeat(4) }, patchedNode), { code: 'AUTH_SECRET_INVALID' });
  const complete = { ...account, MAIL_DELIVERY_ENABLED: 'true', MAIL_PROVIDER: 'resend', RESEND_API_KEY: randomBytes(32).toString('hex'),
    MAIL_FROM: 'Synthetic <noreply@example.test>', PASSWORD_RESET_FRONTEND_URL: account.AUTH_ALLOWED_ORIGINS,
    EMAIL_VERIFICATION_FRONTEND_URL: account.AUTH_ALLOWED_ORIGINS };
  assert.equal(validateRuntime(complete, patchedNode).auth, true);
  assert.throws(() => validateRuntime({ ...complete, PASSWORD_RESET_FRONTEND_URL: 'https://foreign.example.test' }, patchedNode), { code: 'ACCOUNT_LINK_INVALID' });
  assert.throws(() => validateRuntime({ ...complete, AUTH_ALLOW_INSECURE_LOCALHOST: 'true' }, patchedNode));
  const analytics = validateRuntime({ ...base, ANALYTICS_ENABLED: 'true', MONGODB_URI: account.MONGODB_URI, ANALYTICS_ALLOWED_ORIGINS: account.AUTH_ALLOWED_ORIGINS }, patchedNode);
  assert.equal(analytics.database, true, 'anonymous analytics requires a DB even when authentication is off');
});

async function listen(application, run) {
  const server = await new Promise(resolve => { const listener = application.listen(0, '127.0.0.1', () => resolve(listener)); });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
test('malformed, oversized and compressed JSON fail safely while liveness stays available', async () => {
  await listen(app, async base => {
    for (const [body, extra, status] of [
      ['{', {}, 400], ['{"password":"' + 'x'.repeat(9000) + '"}', {}, 413],
      [gzipSync(Buffer.from('{}')), { 'Content-Encoding': 'gzip' }, 415],
    ]) {
      const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body });
      assert.equal(response.status, status);
      const payload = await response.json();
      assert.equal(payload.success, false); assert.equal(payload.stack, undefined);
      assert.ok(!JSON.stringify(payload).includes('password'));
    }
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200); assert.ok(health.headers.get('x-content-type-options'));
  });
});

test('readiness conceals failures, recovers, and bounds slow checks', async () => {
  await assertRuntimeReady({ database: false });
  await assert.rejects(assertRuntimeReady({ database: true }));
  let fail = true;
  const probe = express();
  probe.get('/ready', createReadinessHandler(async () => { if (fail) throw new Error('mongodb://hidden:credential@private-host'); }, { cacheMs: 0 }));
  probe.get('/slow', createReadinessHandler(() => new Promise(() => {}), { timeoutMs: 30 }));
  await listen(probe, async base => {
    let response = await fetch(base + '/ready');
    assert.equal(response.status, 503); let body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['status', 'success', 'timestamp']); assert.equal(body.status, 'unavailable');
    fail = false; response = await fetch(base + '/ready'); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    response = await fetch(base + '/slow', { signal: AbortSignal.timeout(1000) }); assert.equal(response.status, 503);
  });
});

test('the real server starts privately, answers probes, and drains on shutdown', { timeout: 20000 }, async () => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const source = `require('./src/server').startServer().then(server => {
    process.on('message', () => process.emit('SIGTERM'));
    process.send({ port: server.address().port });
  }).catch(() => { process.exitCode = 1; });`;
  const child = spawn(process.execPath, ['-e', source], { cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), CONTENT_SOURCE: 'pdf',
      AUTH_ENABLED: 'false', ANALYTICS_ENABLED: 'false', COMMUNITY_POSTING_ENABLED: 'false',
      ADMINISTRATION_ENABLED: 'false', MAIL_DELIVERY_ENABLED: 'false', AUTH_ALLOW_INSECURE_LOCALHOST: 'false',
      AUTH_TRUST_PROXY_HOPS: '0', MONGODB_URI: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '', errors = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { errors += data; });
  const exited = once(child, 'exit');
  const abort = AbortSignal.timeout(12000);
  try {
    const [message] = await once(child, 'message', { signal: abort });
    assert.equal(message.port, port);
    for (const probe of ['health', 'ready']) {
      const response = await fetch(`http://127.0.0.1:${port}/api/${probe}`, { signal: abort });
      assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
    }
    child.send('shutdown'); child.disconnect();
    const [code] = await exited; assert.equal(code, 0);
    assert.match(output, /server_started/); assert.match(output, /shutdown_complete/);
    assert.equal(errors, '');
  } finally { if (child.exitCode === null) child.kill(); }
});

test('production startup never imports a development env file', { timeout: 10000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'htt-production-env-'));
  const envFile = path.join(directory, '.env');
  fs.writeFileSync(envFile, 'SYNTHETIC_LOCAL_SECRET=synthetic-development-value\n');
  const env = { ...process.env, NODE_ENV: 'production', PORT: 'invalid-port' };
  delete env.SYNTHETIC_LOCAL_SECRET;
  const source = `require(${JSON.stringify(require.resolve('../src/server'))}).startServer()
    .then(() => { process.exitCode = 1; })
    .catch(() => { if (process.env.SYNTHETIC_LOCAL_SECRET) process.exitCode = 1; else console.log('LOCAL_ENV_SKIPPED'); });`;
  const child = spawn(process.execPath, ['-e', source], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', data => { output += data; });
  try {
    const [code] = await once(child, 'exit'); assert.equal(code, 0); assert.match(output, /LOCAL_ENV_SKIPPED/);
  } finally {
    if (child.exitCode === null) child.kill();
    fs.unlinkSync(envFile); fs.rmdirSync(directory);
  }
});
