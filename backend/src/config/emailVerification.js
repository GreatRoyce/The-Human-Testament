const { accountLinkConfig } = require('./accountLinks');
const unavailable = () => Object.assign(new Error('Email verification is unavailable. Please try again later.'), { status: 503 });
function getVerificationConfig() {
  return accountLinkConfig({ origin: process.env.EMAIL_VERIFICATION_FRONTEND_URL,
    minutes: process.env.EMAIL_VERIFICATION_TTL_MINUTES, defaultMinutes: 1440, maxMinutes: 1440, unavailable });
}
module.exports = { getVerificationConfig, unavailable };
