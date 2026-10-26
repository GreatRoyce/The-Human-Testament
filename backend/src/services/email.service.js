const { passwordResetEmail } = require('../emails/passwordReset');
const { emailVerificationEmail } = require('../emails/emailVerification');
// No console transport: recovery credentials must never become development logs.
function createEmailService({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  async function send(message) {
    if (env.MAIL_DELIVERY_ENABLED !== 'true' || env.MAIL_PROVIDER !== 'resend' ||
        (env.NODE_ENV === 'test' && fetchImpl === globalThis.fetch)) return { status: 'disabled' };
    const from = env.MAIL_FROM;
    if (!env.RESEND_API_KEY || !from || /[\r\n]/.test(from)) return { status: 'failed' };
    try {
      const response = await fetchImpl('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...message, from, to: [message.to] }) });
      // Acceptance is not a claim of inbox delivery. Never log provider bodies.
      if (!response.ok) return { status: 'failed' };
      const result = await response.json();
      return typeof result.id === 'string' && result.id ? { status: 'accepted' } : { status: 'failed' };
    } catch { return { status: 'failed' }; }
  }
  return { sendPasswordReset: input => send(passwordResetEmail(input)),
    sendEmailVerification: input => send(emailVerificationEmail(input)) };
}
module.exports = { createEmailService, sendPasswordReset: input => createEmailService().sendPasswordReset(input),
  sendEmailVerification: input => createEmailService().sendEmailVerification(input) };
