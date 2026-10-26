const { getAuthConfig } = require('./auth');
const invalid = code => Object.assign(new Error('Invalid runtime configuration.'), { code });
const placeholder = value => /(?:<[^>]+>|changeme|change[-_ ]?me|replace[-_ ]?me|your[-_ ](?:secret|password|key)|example|development|test[-_ ]?secret)/i.test(value);

// Reviewed security floors apply at production startup, not in test fixtures.
// Revisit the floors at each release as new Node security patches are published.
function supportedRuntime(version) {
  const [major, minor, patch] = version.replace(/^v/, '').split('.').map(Number);
  const floor = { 22: [23, 4], 24: [22, 1], 26: [12, 1] }[major];
  return Boolean(floor && (minor > floor[0] || (minor === floor[0] && patch >= floor[1])));
}
function validateRuntime(env = process.env, version = process.versions.node) {
  const mode = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(mode)) throw invalid('NODE_ENV_INVALID');
  const production = mode === 'production';
  if (production && !supportedRuntime(version)) throw invalid('NODE_SECURITY_UPDATE_REQUIRED');
  for (const key of ['AUTH_ENABLED', 'ANALYTICS_ENABLED', 'COMMUNITY_POSTING_ENABLED', 'ADMINISTRATION_ENABLED', 'MAIL_DELIVERY_ENABLED', 'AUTH_ALLOW_INSECURE_LOCALHOST'])
    if (env[key] !== undefined && !['true', 'false'].includes(env[key])) throw invalid('FEATURE_FLAG_INVALID');
  const auth = env.AUTH_ENABLED === 'true', analytics = env.ANALYTICS_ENABLED === 'true';
  const community = env.COMMUNITY_POSTING_ENABLED === 'true', administration = env.ADMINISTRATION_ENABLED === 'true';
  if ((community || administration || env.MAIL_DELIVERY_ENABLED === 'true') && !auth) throw invalid('AUTH_REQUIRED');
  const contentSource = env.CONTENT_SOURCE || 'pdf';
  if (!['pdf', 'database'].includes(contentSource)) throw invalid('CONTENT_SOURCE_INVALID');
  const port = env.PORT || '5000', proxy = env.AUTH_TRUST_PROXY_HOPS ?? '0';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw invalid('PORT_INVALID');
  if (!/^\d+$/.test(proxy) || Number(proxy) > 10) throw invalid('TRUST_PROXY_INVALID');
  const host = env.HOST || '127.0.0.1';
  if (!/^(?:localhost|[a-zA-Z0-9.-]+|::1|::)$/.test(host)) throw invalid('HOST_INVALID');
  const database = auth || analytics || contentSource === 'database';
  if (database && (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI || '') || (production && placeholder(env.MONGODB_URI)))) throw invalid('DATABASE_CONFIGURATION_INVALID');
  if (auth) {
    const config = getAuthConfig(env);
    if (production && (placeholder(config.secret) || new Set(config.secret).size < 12 || config.secret !== config.secret.trim())) throw invalid('AUTH_SECRET_INVALID');
    // An account release must support verification and recovery.
    if (production && env.MAIL_DELIVERY_ENABLED !== 'true') throw invalid('ACCOUNT_MAIL_REQUIRED');
    if (production || env.MAIL_DELIVERY_ENABLED === 'true') {
      if (env.MAIL_PROVIDER !== 'resend' || !env.RESEND_API_KEY || placeholder(env.RESEND_API_KEY) || !env.MAIL_FROM || /[\r\n]/.test(env.MAIL_FROM)) throw invalid('MAIL_CONFIGURATION_INVALID');
      for (const key of ['PASSWORD_RESET_FRONTEND_URL', 'EMAIL_VERIFICATION_FRONTEND_URL']) {
        let url; try { url = new URL(env[key]); } catch { throw invalid('ACCOUNT_LINK_INVALID'); }
        if (url.href !== url.origin + '/' || !config.origins.includes(url.origin)) throw invalid('ACCOUNT_LINK_INVALID');
      }
      for (const [key, fallback, max] of [['PASSWORD_RESET_TTL_MINUTES', 30, 60], ['EMAIL_VERIFICATION_TTL_MINUTES', 1440, 1440]]) {
        const ttl = Number(env[key] ?? fallback);
        if (!Number.isInteger(ttl) || ttl < 5 || ttl > max) throw invalid('ACCOUNT_LINK_TTL_INVALID');
      }
    }
  }
  if (analytics) {
    const days = Number(env.ANALYTICS_RETENTION_DAYS || 180);
    const origins = (env.ANALYTICS_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!origins.length || !Number.isInteger(days) || days < 7 || days > 365) throw invalid('ANALYTICS_CONFIGURATION_INVALID');
    for (const origin of origins) {
      let url; try { url = new URL(origin); } catch { throw invalid('ANALYTICS_CONFIGURATION_INVALID'); }
      if (url.origin !== origin || (url.protocol !== 'https:' && !(mode !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:'))) throw invalid('ANALYTICS_CONFIGURATION_INVALID');
    }
  }
  return { production, auth, analytics, community, administration, database, contentSource, port: Number(port), host, proxyHops: Number(proxy) };
}
module.exports = { validateRuntime, supportedRuntime };
