const { passwordResetEmail } = require('../emails/passwordReset');
const { emailVerificationEmail } = require('../emails/emailVerification');
const { getGmailConfig, validMailbox } = require('../config/gmail');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const sameCredentials = (a, b) => a && b && a.clientId === b.clientId &&
  a.clientSecret === b.clientSecret && a.refreshToken === b.refreshToken;

function rawMessage(from, message) {
  if (!validMailbox(message.to) || typeof message.subject !== 'string' ||
      /[^\x20-\x7e]/.test(message.subject)) throw new Error('Invalid email message.');
  const body = Buffer.from(message.text.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64');
  const mime = [
    `From: ${from}`, `To: ${message.to}`, `Subject: ${message.subject}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '', body.match(/.{1,76}/g).join('\r\n'), '',
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}

// No console transport: recovery credentials must never become development logs.
function createEmailService({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let cached, refreshing;
  async function accessToken(config) {
    if (sameCredentials(cached?.config, config) && now() < cached.expiresAt) return cached.value;
    if (sameCredentials(refreshing?.config, config)) return refreshing.promise;
    const job = { config };
    job.promise = (async () => {
      const startedAt = now();
      const response = await fetchImpl(TOKEN_URL, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
          refresh_token: config.refreshToken, grant_type: 'refresh_token' }).toString(),
      });
      if (!response.ok) throw new Error('Email authorization failed.');
      const result = await response.json();
      if (typeof result.access_token !== 'string' || !result.access_token || /[\s\x00-\x1f\x7f]/.test(result.access_token) ||
          result.token_type?.toLowerCase() !== 'bearer' || !Number.isInteger(result.expires_in) || result.expires_in <= 60)
        throw new Error('Email authorization failed.');
      cached = { config, value: result.access_token, expiresAt: startedAt + (result.expires_in - 60) * 1000 };
      return cached.value;
    })();
    refreshing = job;
    try { return await job.promise; }
    finally { if (refreshing === job) refreshing = undefined; }
  }

  async function send(message) {
    if (env.MAIL_DELIVERY_ENABLED !== 'true' || env.MAIL_PROVIDER !== 'gmail' ||
        (env.NODE_ENV === 'test' && fetchImpl === globalThis.fetch)) return { status: 'disabled' };
    try {
      const config = getGmailConfig(env);
      const raw = rawMessage(config.from, message);
      const token = await accessToken(config);
      const response = await fetchImpl(SEND_URL, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
      // A rejected credential is refreshed on the next user-requested delivery.
      // Never automatically retry a send: a timeout can follow real acceptance.
      if (response.status === 401 && cached?.value === token) cached = undefined;
      // Acceptance is not a claim of inbox delivery. Never log provider bodies.
      if (!response.ok) return { status: 'failed' };
      const result = await response.json();
      return typeof result.id === 'string' && result.id ? { status: 'accepted' } : { status: 'failed' };
    } catch { return { status: 'failed' }; }
  }
  return { sendPasswordReset: input => send(passwordResetEmail(input)),
    sendEmailVerification: input => send(emailVerificationEmail(input)) };
}
const service = createEmailService();
module.exports = { createEmailService, sendPasswordReset: input => service.sendPasswordReset(input),
  sendEmailVerification: input => service.sendEmailVerification(input) };
