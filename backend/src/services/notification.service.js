const Notification = require('../models/Notification');
const User = require('../models/User');
const { authenticatedUser } = require('../utils/authorization');
const { bodyFields } = require('../utils/accountInput');
const { notificationAccess } = require('./notificationResource.service');
const invalid = () => { throw Object.assign(new Error('Invalid notification input.'), { status: 400 }); };
const missing = () => { throw Object.assign(new Error('Notification not found.'), { status: 404 }); };
function pagination(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !['page', 'limit'].includes(key))) invalid();
  const integer = (key, fallback, max) => {
    if (query[key] === undefined) return fallback;
    if (typeof query[key] !== 'string' || !/^[1-9]\d*$/.test(query[key]) || Number(query[key]) > max) invalid();
    return Number(query[key]);
  };
  return { page: integer('page', 1, 10000), limit: integer('limit', 20, 50) };
}
async function dto(row, user) {
  const access = await notificationAccess(row, user);
  const common = { id: String(row._id), createdAt: row.createdAt, readAt: row.readAt ?? null };
  if (!access) return { ...common, type: 'unavailable', resourceType: null, resourceId: null, message: 'This activity is no longer available.', actor: null, targetUrl: null };
  const actor = row.actor && access.showActor ? await User.findOne({ _id: row.actor, isActive: true }).select('_id displayName').lean() : null;
  return { ...common, type: row.type, resourceType: row.resourceType, resourceId: String(row.resourceId), message: Notification.messages[row.type],
    actor: actor ? { id: String(actor._id), displayName: actor.displayName } : null, targetUrl: access.targetUrl };
}
async function list(auth, query = {}) {
  const user = authenticatedUser(auth), paging = pagination(query), filter = { recipient: user._id };
  const [rows, total] = await Promise.all([Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((paging.page - 1) * paging.limit).limit(paging.limit).maxTimeMS(5000).lean(), Notification.countDocuments(filter).maxTimeMS(5000)]);
  return { items: await Promise.all(rows.map(row => dto(row, user))), pagination: { ...paging, total, pages: Math.ceil(total / paging.limit) } };
}
async function unreadCount(auth, query = {}) {
  const user = authenticatedUser(auth); bodyFields(query, []);
  return { unreadCount: await Notification.countDocuments({ recipient: user._id, readAt: null }).maxTimeMS(5000) };
}
async function markRead(auth, id, body, query = {}) {
  const user = authenticatedUser(auth); bodyFields(body, []); bodyFields(query, []);
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) missing();
  const filter = { _id: id, recipient: user._id };
  const row = await Notification.findOneAndUpdate({ ...filter, readAt: null }, { $set: { readAt: new Date() } }, { returnDocument: 'after', runValidators: true }).lean() ?? await Notification.findOne(filter).lean();
  if (!row) missing(); return { item: await dto(row, user) };
}
async function readAll(auth, body, query = {}) {
  const user = authenticatedUser(auth); bodyFields(body, []); bodyFields(query, []);
  const at = new Date();
  const result = await Notification.updateMany({ recipient: user._id, readAt: null, createdAt: { $lte: at } }, { $set: { readAt: at } }, { runValidators: true, maxTimeMS: 5000 });
  return { markedCount: result.modifiedCount };
}
module.exports = { list, unreadCount, markRead, readAll };
