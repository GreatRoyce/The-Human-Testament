// Fake HTTPS transports only. No .env, Google account, database, or live delivery.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEmailService } = require('../src/services/email.service');
const { getGmailConfig } = require('../src/config/gmail');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const configuration = () => ({ NODE_ENV: 'test', MAIL_DELIVERY_ENABLED: 'true', MAIL_PROVIDER: 'gmail',
  MAIL_FROM: 'The Human Testament <hello@example.test>', GMAIL_CLIENT_ID: 'synthetic-client.apps.googleusercontent.com',
  GMAIL_CLIENT_SECRET: 'synthetic-client-secret', GMAIL_REFRESH_TOKEN: 'synthetic-refresh-token' });
const input = { to: 'reader+account@example.test', link: 'https://reader.example.test/verify-email#token=synthetic', minutes: 30 };
const authorization = (overrides = {}) => Response.json({ access_token: 'synthetic-access-token',
  token_type: 'Bearer', expires_in: 3600, ...overrides });

test('Gmail sends both account templates as UTF-8 MIME through fixed HTTPS endpoints', async () => {
  const env = configuration(), calls = [];
  const service = createEmailService({ env, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return url === TOKEN_URL ? authorization() : Response.json({ id: 'synthetic-message-id' });
  } });
  assert.deepEqual(await service.sendEmailVerification(input), { status: 'accepted' });
  assert.deepEqual(await service.sendPasswordReset({ ...input, link: input.link + '&label=Réad' }), { status: 'accepted' });
  assert.deepEqual(calls.map(call => call.url), [TOKEN_URL, SEND_URL, SEND_URL]);
  const params = new URLSearchParams(calls[0].init.body);
  assert.deepEqual(Object.fromEntries(params), { client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET,
    refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' });
  for (const [index, subject] of [[1, 'Verify your Human Testament email'], [2, 'Reset your Human Testament password']]) {
    const call = calls[index], body = JSON.parse(call.init.body);
    assert.deepEqual(Object.keys(body), ['raw']); assert.match(body.raw, /^[a-zA-Z0-9_-]+$/);
    const [headers, encoded] = Buffer.from(body.raw, 'base64url').toString('utf8').split('\r\n\r\n');
    assert.ok(headers.includes('From: ' + env.MAIL_FROM)); assert.ok(headers.includes('To: ' + input.to));
    assert.ok(headers.includes('Subject: ' + subject)); assert.ok(headers.includes('Content-Type: text/plain; charset=UTF-8'));
    assert.ok(encoded.trimEnd().split('\r\n').every(line => line.length <= 76));
    const text = Buffer.from(encoded, 'base64').toString('utf8');
    assert.ok(text.includes(input.link)); assert.ok(text.includes('30 minutes'));
    if (index === 2) assert.ok(text.includes('Réad'));
    assert.equal(call.init.headers.Authorization, 'Bearer synthetic-access-token');
    assert.ok(!JSON.stringify(call).includes(env.GMAIL_REFRESH_TOKEN));
  }
  for (const { url, init } of calls) {
    assert.equal(new URL(url).protocol, 'https:'); assert.equal(init.redirect, 'error');
    assert.equal(init.method, 'POST'); assert.ok(init.signal instanceof AbortSignal);
  }
});

test('disabled delivery, unknown providers, and the default test transport never contact Google', async () => {
  const fetchImpl = () => { throw new Error('Unexpected network call.'); };
  for (const overrides of [{ MAIL_DELIVERY_ENABLED: 'false' }, { MAIL_PROVIDER: 'resend' }, { MAIL_PROVIDER: '' }]) {
    const service = createEmailService({ env: { ...configuration(), ...overrides }, fetchImpl });
    assert.deepEqual(await service.sendEmailVerification(input), { status: 'disabled' });
  }
  assert.deepEqual(await createEmailService({ env: configuration() }).sendPasswordReset(input), { status: 'disabled' });
});

test('missing credentials and injected sender or recipient headers fail before network access', async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; throw new Error('Unexpected network call.'); };
  for (const key of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'MAIL_FROM']) {
    for (const value of ['', 'value\r\nBcc: hidden@example.test', ' value ']) {
      const env = { ...configuration(), [key]: value };
      assert.throws(() => getGmailConfig(env), { code: 'MAIL_CONFIGURATION_INVALID' });
      assert.deepEqual(await createEmailService({ env, fetchImpl }).sendPasswordReset(input), { status: 'failed' });
    }
  }
  for (const from of ['first@example.test,second@example.test', 'Reader <hello@example.test> <hidden@example.test>',
    'hello@-invalid.test', '.hello@example.test', 'hello..again@example.test',
    'hello@example.test\n', 'Reader <hello@example.test>\n', 'Reader\x00 <hello@example.test>']) {
    assert.throws(() => getGmailConfig({ ...configuration(), MAIL_FROM: from }));
  }
  const service = createEmailService({ env: configuration(), fetchImpl });
  for (const to of ['reader@example.test\r\nBcc: hidden@example.test', 'reader@example.test\n',
    'one@example.test,two@example.test', 'invalid'])
    assert.deepEqual(await service.sendEmailVerification({ ...input, to }), { status: 'failed' });
  assert.equal(calls, 0);
});

test('concurrent deliveries share token refresh and expired tokens refresh before another send', async () => {
  let time = 0, refreshes = 0, sends = 0;
  const service = createEmailService({ env: configuration(), now: () => time, fetchImpl: async url => {
    if (url === TOKEN_URL) { refreshes++; return authorization(); }
    sends++; return Response.json({ id: 'synthetic-id' });
  } });
  const outcomes = await Promise.all([service.sendEmailVerification(input), service.sendPasswordReset(input)]);
  assert.deepEqual(outcomes, [{ status: 'accepted' }, { status: 'accepted' }]);
  assert.equal(refreshes, 1); assert.equal(sends, 2);
  time = 3539000;
  await service.sendPasswordReset(input); assert.equal(refreshes, 1);
  time = 3540000;
  await service.sendPasswordReset(input); assert.equal(refreshes, 2);
});

test('failed token requests recover on the next attempt without logging private errors', async t => {
  const logs = [];
  for (const method of ['info', 'error', 'warn', 'log']) t.mock.method(console, method, (...args) => logs.push(args));
  const failures = [
    () => new Response('private-google-error', { status: 400 }), () => new Response('invalid-json'),
    () => Response.json({}), () => authorization({ token_type: 'NotBearer' }),
    () => authorization({ expires_in: '3600' }), () => authorization({ expires_in: 0 }),
    () => authorization({ access_token: 'bad\r\ntoken' }), () => authorization({ access_token: 'bad\x00token' }),
    () => { throw new Error('private-token-error'); },
  ];
  for (const fail of failures) {
    let refreshes = 0, sends = 0;
    const service = createEmailService({ env: configuration(), fetchImpl: async url => {
      if (url === TOKEN_URL) return ++refreshes === 1 ? fail() : authorization();
      sends++; return Response.json({ id: 'synthetic-id' });
    } });
    assert.deepEqual(await service.sendPasswordReset(input), { status: 'failed' }); assert.equal(sends, 0);
    assert.deepEqual(await service.sendPasswordReset(input), { status: 'accepted' }); assert.equal(sends, 1);
  }
  assert.deepEqual(logs, []);
});

test('Gmail failures and ambiguous sends are never retried or reported as accepted', async () => {
  for (const fail of [() => new Response('private-error', { status: 403 }),
    () => new Response('private-error', { status: 429 }), () => new Response('private-error', { status: 500 }),
    () => Response.json({}), () => Response.json({ id: 123 }), () => new Response('invalid-json'),
    () => { throw new DOMException('private-send-timeout', 'TimeoutError'); }]) {
    let sends = 0;
    const service = createEmailService({ env: configuration(), fetchImpl: async url => {
      if (url === TOKEN_URL) return authorization();
      sends++; return fail();
    } });
    assert.deepEqual(await service.sendEmailVerification(input), { status: 'failed' }); assert.equal(sends, 1);
  }
});

test('a rejected access token is discarded, with refresh deferred until the next requested email', async () => {
  let refreshes = 0, sends = 0;
  const service = createEmailService({ env: configuration(), fetchImpl: async url => {
    if (url === TOKEN_URL) { refreshes++; return authorization(); }
    return ++sends === 1 ? new Response('private-error', { status: 401 }) : Response.json({ id: 'synthetic-id' });
  } });
  assert.deepEqual(await service.sendPasswordReset(input), { status: 'failed' });
  assert.equal(refreshes, 1); assert.equal(sends, 1);
  assert.deepEqual(await service.sendPasswordReset(input), { status: 'accepted' });
  assert.equal(refreshes, 2); assert.equal(sends, 2);
});

test('changing OAuth credentials does not reuse a token authorized by another credential set', async () => {
  const env = configuration(); let refreshes = 0;
  const service = createEmailService({ env, fetchImpl: async url => {
    if (url === TOKEN_URL) { refreshes++; return authorization(); }
    return Response.json({ id: 'synthetic-id' });
  } });
  await service.sendEmailVerification(input);
  env.GMAIL_REFRESH_TOKEN = 'another-synthetic-refresh-token';
  await service.sendEmailVerification(input);
  assert.equal(refreshes, 2);
});
