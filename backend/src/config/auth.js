const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const failure = () => Object.assign(new Error('Authentication is unavailable.'), { status: 503, code: 'AUTH_UNAVAILABLE' });

function getAuthConfig(env = process.env) {
  if (env.AUTH_ENABLED !== 'true') throw failure();
  const secret = env.AUTH_ACCESS_TOKEN_SECRET;
  const origins = (env.AUTH_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const insecureLocal = env.AUTH_ALLOW_INSECURE_LOCALHOST === 'true';
  const sameSite = env.AUTH_COOKIE_SAME_SITE || 'lax';
  if (!secret || Buffer.byteLength(secret.trim(), 'utf8') < 32 || !origins.length ||
      !['strict', 'lax', 'none'].includes(sameSite) || (insecureLocal && (env.NODE_ENV === 'production' || sameSite === 'none'))) throw failure();
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { throw failure(); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((insecureLocal && !local) || url.origin !== origin || url.username || url.password ||
        (url.protocol !== 'https:' && !(insecureLocal && local && url.protocol === 'http:'))) throw failure();
  }
  return { secret, origins, insecureLocal, accessTtlSeconds: ACCESS_TTL_SECONDS, refreshTtlMs: REFRESH_TTL_MS,
    cookieName: insecureLocal ? 'htt_refresh' : '__Secure-htt_refresh',
    cookieOptions: { httpOnly: true, secure: !insecureLocal, sameSite, path: '/api/auth' } };
}

const isAccountPath = path => /^\/api\/(?:auth|users|bookmarks|notes|reading-progress|reading-history|discussions|comments|reading-circles|reports|moderation|articles|notifications|analytics|admin)(?:\/|$)/i.test(path);
function authCorsOptions(req, callback) {
  if (/^\/api\/analytics(?:\/|$)/i.test(req.path)) {
    let origins = []; try { origins = require('./analytics').analyticsConfig().origins; } catch { /* Disabled analytics fail closed. */ }
    return callback(null, { origin: origins.includes(req.get('Origin')) ? req.get('Origin') : false, credentials: false,
      methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Protection'], maxAge: 600 });
  }
  if (!isAccountPath(req.path)) return callback(null, { origin: '*' });
  let origins = [];
  try { origins = getAuthConfig().origins; } catch { /* Unconfigured authentication fails closed. */ }
  callback(null, { origin: origins.includes(req.get('Origin')) ? req.get('Origin') : false,
    credentials: true, methods: /^\/api\/reading-progress(?:\/|$)/i.test(req.path) ? ['GET', 'PUT', 'OPTIONS'] :
      /^\/api\/reading-history(?:\/|$)/i.test(req.path) ? ['GET', 'OPTIONS'] :
      /^\/api\/(?:bookmarks|notes|discussions|comments|reading-circles|reports|moderation|articles|notifications)(?:\/|$)/i.test(req.path) ? ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] :
      /^\/api\/(?:users|admin)(?:\/|$)/i.test(req.path) ? ['GET', 'PATCH', 'OPTIONS'] : ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Protection'], maxAge: 600 });
}

module.exports = { getAuthConfig, authCorsOptions, isAccountPath, failure };
