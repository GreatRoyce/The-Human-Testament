// Public build-time configuration only. Error messages never include values.
export function validateProductionEnv(env) {
  const allowed = new Set(['VITE_API_URL', 'VITE_CONTENT_SOURCE', 'VITE_ANALYTICS_ENABLED']);
  for (const key of Object.keys(env)) if (key.startsWith('VITE_') && !allowed.has(key)) throw new Error('Unsupported public build variable. Server secrets must not use the VITE_ prefix.');
  const source = env.VITE_CONTENT_SOURCE || 'pdf';
  if (!['pdf', 'api'].includes(source)) throw new Error('Production content source must be pdf or api.');
  if (env.VITE_ANALYTICS_ENABLED !== undefined && !['true', 'false'].includes(env.VITE_ANALYTICS_ENABLED)) throw new Error('Invalid analytics build flag.');
  if (!env.VITE_API_URL) {
    if (source === 'api' || env.VITE_ANALYTICS_ENABLED === 'true') throw new Error('An API URL is required for API content or analytics.');
    return;
  }
  let url; try { url = new URL(env.VITE_API_URL); } catch { throw new Error('Invalid public API URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /\/api\/?$/.test(url.pathname)) throw new Error('Production API URL must use HTTPS without credentials, query, fragment, or a trailing /api.');
}
