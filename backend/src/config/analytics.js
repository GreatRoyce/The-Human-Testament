const unavailable = () => Object.assign(new Error('Analytics are unavailable.'), { status: 503 });
function analyticsConfig(requireEnabled = true) {
  const origins = (process.env.ANALYTICS_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const retentionDays = Number(process.env.ANALYTICS_RETENTION_DAYS || 180);
  if ((requireEnabled && process.env.ANALYTICS_ENABLED !== 'true') || !origins.length || !Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 365) throw unavailable();
  for (const origin of origins) {
    let url; try { url = new URL(origin); } catch { throw unavailable(); }
    if (url.origin !== origin || url.username || url.password || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:'))) throw unavailable();
  }
  return { origins, retentionDays };
}
module.exports = { analyticsConfig, unavailable };
