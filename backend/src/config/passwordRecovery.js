const { accountLinkConfig } = require('./accountLinks');
const unavailable = () => Object.assign(new Error('Password recovery is unavailable. Please try again later.'), { status: 503 });
function getRecoveryConfig() {
  return accountLinkConfig({ origin: process.env.PASSWORD_RESET_FRONTEND_URL,
    minutes: process.env.PASSWORD_RESET_TTL_MINUTES, defaultMinutes: 30, maxMinutes: 60, unavailable });
}
module.exports = { getRecoveryConfig, unavailable };
