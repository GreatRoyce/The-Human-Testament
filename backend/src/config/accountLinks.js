const { getAuthConfig } = require('./auth');
// Credentials use only a server-owned origin present in the auth allowlist.
function accountLinkConfig({ origin, minutes, defaultMinutes, maxMinutes, unavailable }) {
  const auth = getAuthConfig();
  const ttl = Number(minutes ?? defaultMinutes);
  let frontend;
  try { frontend = new URL(origin); } catch { throw unavailable(); }
  if (!Number.isInteger(ttl) || ttl < 5 || ttl > maxMinutes ||
      frontend.href !== frontend.origin + '/' || !auth.origins.includes(frontend.origin)) throw unavailable();
  return { ttlMs: ttl * 60000, frontendOrigin: frontend.origin };
}
module.exports = { accountLinkConfig };
