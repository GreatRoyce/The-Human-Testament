const mongoose = require('mongoose');
const User = require('../models/User'), Grant = require('../models/AnalyticsGrant'), Moderator = require('../models/CommunityModerator');
const Audit = require('../models/ModerationAction'), Discussion = require('../models/Discussion'), Comment = require('../models/Comment'), Report = require('../models/ContentReport');
const { requireAdministrator, exclusive, essentialCount } = require('./administrationAccess');
const lifecycle = require('./accountLifecycle.service');
const community = require('./community.service');
const { moderationDates } = require('../utils/moderationQuery');
const { circleVisibilityStages } = require('../utils/moderationVisibility');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const invalid = () => fail(400, 'Invalid administration input.');
const id = value => { if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)) fail(404, 'Account not found.'); return value; };
function fields(value, allowed) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); }
function paging(query, allowed = []) {
  fields(query, ['page', 'limit', ...allowed]);
  const number = (key, fallback, max) => { if (query[key] === undefined) return fallback; if (typeof query[key] !== 'string' || !/^[1-9]\d*$/.test(query[key]) || Number(query[key]) > max) invalid(); return Number(query[key]); };
  return { page: number('page', 1, 10000), limit: number('limit', 20, 50) };
}
function userDTO(row, grants = [], moderator = false) {
  return { id: String(row._id), displayName: row.displayName, email: row.email, role: row.role, isActive: row.isActive, emailVerified: row.emailVerified,
    createdAt: row.createdAt, updatedAt: row.updatedAt, permissions: { administration: grants.some(g => g.role === 'admin' && g.administration === true),
      analyticsOwner: grants.some(g => g.role === 'owner'), analyticsAdmin: grants.some(g => g.role === 'admin'), globalModerator: moderator } };
}
async function capabilities(auth) {
  const actor = await requireAdministrator(auth);
  let analyticsConfigured = false; try { require('../config/analytics').analyticsConfig(); analyticsConfigured = true; } catch { /* Optional dependency. */ }
  return { administration: true, globalModerator: await community.globalModerator(actor), roleManagement: false, analyticsConfigured };
}
async function users(auth, query) {
  await requireAdministrator(auth);
  const pagination = paging(query, ['q', 'role', 'status', 'start', 'end']), match = moderationDates(query);
  if (query.status !== undefined) { if (!['active', 'deactivated'].includes(query.status)) invalid(); match.isActive = query.status === 'active'; }
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || !query.q.trim() || query.q.length > 100 || /[\u0000-\u001f\u007f]/u.test(query.q)) invalid();
    const literal = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    match.$or = [{ displayName: { $regex: literal, $options: 'i' } }, { email: { $regex: literal, $options: 'i' } }];
  }
  if (query.role !== undefined && !['user', 'owner', 'admin', 'moderator', 'administrator'].includes(query.role)) invalid();
  const stages = [
    { $match: match },
    { $project: { displayName: 1, email: 1, role: 1, isActive: 1, emailVerified: 1, createdAt: 1, updatedAt: 1 } },
    { $lookup: { from: Grant.collection.name, let: { account: '$_id' }, pipeline: [{ $match: { revokedAt: null, $expr: { $eq: ['$user', '$$account'] } } }, { $project: { role: 1, administration: 1 } }, { $limit: 2 }], as: 'grants' } },
    { $lookup: { from: Moderator.collection.name, let: { account: '$_id' }, pipeline: [{ $match: { revokedAt: null, $expr: { $eq: ['$user', '$$account'] } } }, { $limit: 1 }, { $project: { _id: 1 } }], as: 'moderators' } },
  ];
  if (query.role) stages.push({ $match: query.role === 'user' ? { role: 'user' } : query.role === 'moderator' ? { 'moderators.0': { $exists: true } } : query.role === 'administrator' ? { grants: { $elemMatch: { role: 'admin', administration: true } } } : { 'grants.role': query.role } });
  stages.push({ $sort: { createdAt: -1, _id: -1 } }, { $facet: { rows: [{ $skip: (pagination.page - 1) * pagination.limit }, { $limit: pagination.limit }], total: [{ $count: 'value' }] } });
  const [result] = await User.aggregate(stages).option({ maxTimeMS: 5000 }); const total = result.total[0]?.value ?? 0;
  return { items: result.rows.map(row => userDTO(row, row.grants, row.moderators.length > 0)), pagination: { ...pagination, total, pages: Math.ceil(total / pagination.limit) } };
}
async function user(auth, userId, query = {}) {
  await requireAdministrator(auth); fields(query, []); id(userId);
  const row = await User.findById(userId).select('displayName email role isActive emailVerified createdAt updatedAt').lean(); if (!row) fail(404, 'Account not found.');
  const grants = await Grant.find({ user: userId, revokedAt: null }).select('role administration').lean();
  return userDTO(row, grants, await community.globalModerator(row));
}
async function changeAccount(auth, userId, body, query = {}) {
  fields(query, []); fields(body, ['isActive', 'expectedIsActive', 'reason']); id(userId);
  if (typeof body.isActive !== 'boolean' || typeof body.expectedIsActive !== 'boolean' || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000) invalid();
  return exclusive(async session => {
    const actor = await requireAdministrator(auth, session);
    if (String(actor._id) === userId) fail(403, 'Administrators cannot change their own account status.');
    const target = await User.findById(userId).select('isActive').session(session); if (!target) fail(404, 'Account not found.');
    if (target.isActive !== body.expectedIsActive) fail(409, 'Account status changed. Reload before continuing.');
    if (target.isActive === body.isActive) return { message: 'Account already has this status.', id: userId, isActive: target.isActive };
    const result = await lifecycle.setAccountActive(userId, body.isActive, { session });
    if (!body.isActive && await essentialCount(session) < 1) fail(409, 'The last active administrator cannot be deactivated.');
    await Audit.create([{ moderator: actor._id, targetType: 'user', targetId: userId, action: body.isActive ? 'activate' : 'deactivate', reason: body.reason,
      previousStatus: target.isActive ? 'active' : 'deactivated', resultingStatus: body.isActive ? 'active' : 'deactivated', source: 'administration' }], { session });
    return { ...result, message: body.isActive ? 'Account reactivated. A new login is required.' : 'Account deactivated and credentials revoked.' };
  });
}
function auditDTO(row) { return { id: String(row._id), moderatorId: String(row.moderator), targetType: row.targetType, targetId: String(row.targetId),
  action: row.action, reason: row.reason, previousStatus: row.previousStatus ?? '', resultingStatus: row.resultingStatus ?? '', createdAt: row.createdAt,
  source: row.source || 'moderation', operatorLabel: row.operatorLabel || '' }; }
async function audit(auth, query) {
  const actor = await requireAdministrator(auth), pagination = paging(query, ['targetType', 'targetId', 'action', 'start', 'end']);
  const moderator = await community.globalModerator(actor), adminTypes = ['user', 'admin_permission'], types = moderator ? [...adminTypes, 'discussion', 'comment', 'report', 'article'] : adminTypes;
  const match = { ...moderationDates(query), targetType: { $in: types } };
  if (query.targetType !== undefined) { if (!Audit.schema.path('targetType').enumValues.includes(query.targetType)) invalid(); if (!types.includes(query.targetType)) fail(403, 'Separate moderator access is required.'); match.targetType = query.targetType; }
  if (query.targetId !== undefined) match.targetId = new mongoose.Types.ObjectId(id(query.targetId));
  if (query.action !== undefined) { if (!Audit.schema.path('action').enumValues.includes(query.action)) invalid(); match.action = query.action; }
  const stages = [{ $match: match }];
  if (moderator) stages.push(
    { $lookup: { from: Discussion.collection.name, localField: 'targetId', foreignField: '_id', as: 'discussion' } },
    { $lookup: { from: Comment.collection.name, localField: 'targetId', foreignField: '_id', as: 'comment' } },
    { $lookup: { from: Discussion.collection.name, localField: 'comment.discussion', foreignField: '_id', as: 'parent' } },
    { $lookup: { from: Report.collection.name, localField: 'targetId', foreignField: '_id', as: 'report' } },
    { $match: { $or: [{ targetType: { $in: [...adminTypes, 'article'] } }, { targetType: 'discussion', 'discussion.0': { $exists: true } }, { targetType: 'comment', 'parent.0': { $exists: true } }, { targetType: 'report', 'report.0': { $exists: true } }] } },
    { $set: { circle: { $switch: { branches: [
      { case: { $eq: ['$targetType', 'discussion'] }, then: { $ifNull: [{ $first: '$discussion.circle' }, null] } },
      { case: { $eq: ['$targetType', 'comment'] }, then: { $ifNull: [{ $first: '$parent.circle' }, null] } },
      { case: { $eq: ['$targetType', 'report'] }, then: { $ifNull: [{ $first: '$report.circle' }, null] } },
    ], default: null } } } }, ...circleVisibilityStages(actor),
  );
  stages.push({ $sort: { createdAt: -1, _id: -1 } }, { $facet: { rows: [{ $skip: (pagination.page - 1) * pagination.limit }, { $limit: pagination.limit }, { $project: { moderator: 1, targetType: 1, targetId: 1, action: 1, reason: 1, previousStatus: 1, resultingStatus: 1, createdAt: 1, source: 1, operatorLabel: 1 } }], total: [{ $count: 'value' }] } });
  const [result] = await Audit.aggregate(stages).option({ maxTimeMS: 5000 }); const total = result.total[0]?.value ?? 0;
  return { items: result.rows.map(auditDTO), pagination: { ...pagination, total, pages: Math.ceil(total / pagination.limit) } };
}
async function overview(auth, query = {}) {
  const actor = await requireAdministrator(auth); fields(query, []);
  const [users] = await User.aggregate([{ $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } }, deactivated: { $sum: { $cond: ['$isActive', 0, 1] } }, recent: { $sum: { $cond: [{ $gte: ['$createdAt', new Date(Date.now() - 7 * 86400000)] }, 1, 0] } } } }]).option({ maxTimeMS: 5000 });
  const moderator = await community.globalModerator(actor);
  const optional = async work => { try { return { available: true, data: await work() }; } catch (error) { if (error.status === 401) throw error; return { available: false, message: error.status === 403 ? 'Separate moderator permission is required.' : 'This service is disabled or its storage is unavailable.' }; } };
  const [articles, reports, analytics, recentActions] = await Promise.all([
    optional(async () => { if (!moderator) fail(403, 'Moderator required.'); await require('./articleStorage').assertArticleStorage(); return { pending: (await require('./article.service').queue({ limit: '1' }, actor)).pagination.total }; }),
    optional(async () => { if (!moderator) fail(403, 'Moderator required.'); await require('./communityStorage').assertCommunityStorage(); const counts = await Promise.all(['open', 'reviewed'].map(status => community.reports({ status, limit: '1' }, actor))); return { outstanding: counts.reduce((total, result) => total + result.pagination.total, 0) }; }),
    optional(async () => { require('../config/analytics').analyticsConfig(); await require('./analyticsStorage').assertAnalyticsStorage(); const report = await require('./analytics.service').report(auth, 'admin', { days: '7' }); return { range: report.range, metrics: report.metrics, pages: report.pages, coverage: report.coverage }; }),
    audit(auth, { limit: '5' }),
  ]);
  return { users: { total: users?.total ?? 0, active: users?.active ?? 0, deactivated: users?.deactivated ?? 0, recent: users?.recent ?? 0, recentDays: 7 }, articles, reports, analytics, recentActions: recentActions.items,
    communityQueue: { available: false, message: 'Discussions and comments publish immediately. Moderation is driven by reports; no prepublication queue exists.' },
    health: { authentication: 'ready', administration: 'ready', timestamp: new Date() } };
}
module.exports = { capabilities, overview, users, user, changeAccount, audit };
