const { createHash } = require('node:crypto');
const { isIP } = require('node:net');
const Event = require('../models/AnalyticsEvent'), Grant = require('../models/AnalyticsGrant'), State = require('../models/AnalyticsState');
const Article = require('../models/Article');
const { isCanonicalBook, isCanonicalLocation } = require('../utils/canonicalReference');
const { authenticatedUser } = require('../utils/authorization');
const { analyticsConfig } = require('../config/analytics');
const DAY = 86400000;
const invalid = message => Object.assign(new Error(message), { status: 400 });
const hash = value => createHash('sha256').update(value).digest('hex');
function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw invalid('Invalid analytics fields.');
}
async function contentType(path) {
  if (typeof path !== 'string' || path.length > 200 || /[?#%\\\s]/u.test(path)) throw invalid('Invalid public page path.');
  const fixed = { '/': 'site', '/contact': 'site', '/privacy': 'site', '/terms': 'site', '/testament': 'site', '/testament/materials': 'materials', '/search': 'search',
    '/community': 'community', '/community/discussions': 'community', '/community/reading-circles': 'community', '/articles': 'articles' };
  if (Object.hasOwn(fixed, path)) return fixed[path];
  const match = path.match(/^\/testament\/([a-z-]+)(?:\/([1-9]\d{0,2})(?:\/([1-9]\d{0,2}))?)?$/);
  if (match && isCanonicalBook(match[1]) && (!match[2] || isCanonicalLocation(match[1], Number(match[2]), match[3] ? Number(match[3]) : undefined))) return match[3] ? 'verse' : match[2] ? 'chapter' : 'book';
  if (/^\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) && !['mine', 'write', 'moderation'].includes(path.split('/')[2]) && await Article.exists({ slug: path.slice(10), status: 'published' })) return 'article';
  throw invalid('This path is excluded from analytics.');
}
function referralHost(value, origins) {
  if (value === null || value === '') return 'direct / unavailable';
  if (typeof value !== 'string' || value.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value) || isIP(value)) throw invalid('Send only a public referrer hostname.');
  if (origins.some(origin => new URL(origin).hostname === value)) return 'internal';
  return value;
}
async function capabilities(auth) {
  const user = authenticatedUser(auth);
  const grants = await Grant.find({ user: user._id, revokedAt: null }).select('role').lean();
  return { owner: grants.some(x => x.role === 'owner'), admin: grants.some(x => x.role === 'admin') };
}
async function requireScope(auth, scope) {
  if (!['owner', 'admin'].includes(scope) || !(await capabilities(auth))[scope]) throw Object.assign(new Error('This analytics permission is required.'), { status: 403 });
}
const isBot = agent => /bot|crawler|spider|slurp|headless|monitor|uptime|healthcheck|lighthouse|preview|facebookexternalhit/i.test(String(agent || '').slice(0, 1024));
async function record(body, { auth, userAgent, privacy = false, now = new Date() } = {}) {
  fields(body, ['eventId', 'visitorId', 'sessionId', 'path', 'referral', 'consent']);
  if (privacy || body.consent !== true || isBot(userAgent)) return { accepted: false };
  for (const key of ['eventId', 'visitorId', 'sessionId']) if (typeof body[key] !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body[key])) throw invalid('Invalid anonymous identifier.');
  if (auth) { const grants = await capabilities(auth); if (grants.owner || grants.admin) return { accepted: false }; }
  const config = analyticsConfig(), type = await contentType(body.path), referral = referralHost(body.referral, config.origins);
  // Per-visitor event/session namespaces prevent cross-browser ID collisions. Never persist supplied IDs.
  const data = { eventHash: hash(body.visitorId + ':' + body.eventId), visitorHash: hash(body.visitorId), sessionHash: hash(body.visitorId + ':' + body.sessionId),
    path: body.path, contentType: type, referral, authenticated: Boolean(auth), occurredAt: now, expiresAt: new Date(now.getTime() + config.retentionDays * DAY) };
  try { await Event.create(data); } catch (error) { if (error.code !== 11000) throw error; }
  return { accepted: true };
}
function dateRange(query = {}, now = new Date()) {
  fields(query, ['start', 'end', 'days', 'interval', 'limit']);
  const interval = query.interval || 'day', rawLimit = query.limit === undefined ? '10' : query.limit, limit = Number(rawLimit);
  if (!['day', 'week', 'month'].includes(interval) || typeof rawLimit !== 'string' || !/^(?:[1-9]|[1-4]\d|50)$/.test(rawLimit)) throw invalid('Invalid interval or report limit.');
  let start, end;
  if (query.start !== undefined || query.end !== undefined) {
    if (query.days !== undefined) throw invalid('Use a preset or a date range.');
    for (const key of ['start', 'end']) {
      if (typeof query[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(query[key]) || !Number.isFinite(Date.parse(query[key])) || new Date(query[key]).toISOString().slice(0, 10) !== query[key]) throw invalid('Use valid YYYY-MM-DD UTC dates.');
    }
    start = new Date(query.start); end = new Date(Date.parse(query.end) + DAY);
  } else {
    if (query.days !== undefined && !['7', '30', '90'].includes(query.days)) throw invalid('Choose 7, 30 or 90 days.');
    end = new Date(Date.parse(now.toISOString().slice(0, 10)) + DAY); start = new Date(end.getTime() - Number(query.days || 7) * DAY);
  }
  const days = (end - start) / DAY;
  if (days < 1 || days > 90 || start > now || end > Date.parse(now.toISOString().slice(0, 10)) + DAY) throw invalid('Date ranges must cover 1 to 90 days through today.');
  return { start, end, previousStart: new Date(start.getTime() - (end - start)), interval, limit };
}
const aggregate = pipeline => Event.aggregate(pipeline).allowDiskUse(true).option({ maxTimeMS: 10000 });
async function report(auth, scope, query, now = new Date()) {
  await requireScope(auth, scope);
  const range = dateRange(query, now), { start, end, previousStart, interval, limit } = range;
  const retentionFloor = new Date(now.getTime() - analyticsConfig().retentionDays * DAY);
  const match = { occurredAt: { $gte: new Date(Math.max(previousStart, retentionFloor)), $lt: new Date(Math.min(end, now)) }, expiresAt: { $gt: now } };
  const period = { $cond: [{ $gte: ['$occurredAt', start] }, 'current', 'previous'] };
  const count = field => [{ $group: { _id: { period, value: '$' + field } } }, { $group: { _id: '$_id.period', value: { $sum: 1 } } }];
  const [counts] = await aggregate([{ $match: match }, { $facet: {
    pageViews: [{ $group: { _id: period, value: { $sum: 1 } } }], visits: count('sessionHash'), estimatedVisitors: count('visitorHash'),
  } }]);
  const metric = name => Object.fromEntries(['current', 'previous'].map(p => [p, counts[name].find(x => x._id === p)?.value || 0]));
  const metrics = Object.fromEntries(['visits', 'estimatedVisitors', 'pageViews'].map(name => { const { current, previous } = metric(name); return [name, { current, previous, changePercent: previous === 0 ? null : Math.round((current - previous) / previous * 1000) / 10 }]; }));
  const currentMatch = { ...match, occurredAt: { $gte: new Date(Math.max(start, retentionFloor)), $lt: new Date(Math.min(end, now)) } };
  const top = field => [{ $group: { _id: '$' + field, pageViews: { $sum: 1 } } }, { $sort: { pageViews: -1, _id: 1 } }, { $limit: limit }, { $project: { _id: 0, label: '$_id', pageViews: 1 } }];
  const [breakdowns] = await aggregate([{ $match: currentMatch }, { $facet: {
    pages: top('path'), contentTypes: top('contentType'), referrals: top('referral'),
    activity: [{ $group: { _id: '$authenticated', pageViews: { $sum: 1 } } }, { $project: { _id: 0, authenticated: '$_id', pageViews: 1 } }, { $sort: { authenticated: 1 } }],
    trends: [
      { $group: { _id: { bucket: { $dateTrunc: { date: '$occurredAt', unit: interval, timezone: 'UTC', ...(interval === 'week' ? { startOfWeek: 'monday' } : {}) } }, visitor: '$visitorHash', session: '$sessionHash' }, pageViews: { $sum: 1 } } },
      { $group: { _id: { bucket: '$_id.bucket', visitor: '$_id.visitor' }, visits: { $sum: 1 }, pageViews: { $sum: '$pageViews' } } },
      { $group: { _id: '$_id.bucket', estimatedVisitors: { $sum: 1 }, visits: { $sum: '$visits' }, pageViews: { $sum: '$pageViews' } } },
      { $sort: { _id: 1 } }, { $limit: 90 }, { $project: { _id: 0, date: { $dateToString: { date: '$_id', format: '%Y-%m-%d', timezone: 'UTC' } }, visits: 1, pageViews: 1, estimatedVisitors: 1 } },
    ],
  } }]);
  const config = analyticsConfig(), state = await State.findById('collection').lean();
  const earliest = new Date(Math.max(state.startedAt.getTime(), now.getTime() - config.retentionDays * DAY));
  const coverage = { availableFrom: earliest.toISOString(), through: now.toISOString(), partial: start < earliest,
    previousPartial: previousStart < earliest, empty: metrics.pageViews.current === 0, retentionDays: config.retentionDays };
  return { range: { start: start.toISOString().slice(0, 10), end: new Date(end - DAY).toISOString().slice(0, 10), interval, timezone: 'UTC' }, metrics, ...breakdowns, coverage,
    ...(scope === 'admin' ? { operations: { collectionEnabled: true, storageReady: true, retentionDays: config.retentionDays } } : {}) };
}
module.exports = { record, report, capabilities, requireScope, dateRange, contentType, isBot };
