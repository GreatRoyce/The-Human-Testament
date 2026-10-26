const mongoose = require('mongoose');
const Discussion = require('../models/Discussion');
const Comment = require('../models/Comment');
const ReadingCircle = require('../models/ReadingCircle');
const Membership = require('../models/CircleMembership');
const Report = require('../models/ContentReport');
const Audit = require('../models/ModerationAction');
const Moderator = require('../models/CommunityModerator');
const User = require('../models/User');
const { emitNotification } = require('./notificationEvents.service');
const { supportsTransactions, transactionOptions } = require('./accountStorage');
const { isCanonicalBook, isCanonicalLocation, isCanonicalReference } = require('../utils/canonicalReference');
const { moderationDates } = require('../utils/moderationQuery');
const { circleVisibilityStages } = require('../utils/moderationVisibility');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const missing = () => fail(404, 'Community resource not found.');
const invalid = () => fail(400, 'Invalid community input.');
const id = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value) ? value : missing();
const same = (a, b) => Boolean(a && b && String(a) === String(b));
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) invalid();
  return body;
}
function string(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !/\S/u.test(value))) invalid();
  return value;
}
function passage(input) {
  const result = {};
  if (input.bookId !== undefined) { if (!isCanonicalBook(input.bookId)) invalid(); result.bookId = input.bookId; }
  if (input.chapterNumber !== undefined) {
    if (!isCanonicalLocation(input.bookId, input.chapterNumber)) invalid(); result.chapterNumber = input.chapterNumber;
  }
  if (input.verseId !== undefined) {
    if (!isCanonicalReference(input.verseId) || input.verseId.split(':')[0] !== input.bookId || Number(input.verseId.split(':')[1]) !== input.chapterNumber) invalid();
    result.verseId = input.verseId;
  }
  return result;
}
function paging(query, allowed = []) {
  fields(query, ['page', 'limit', ...allowed]);
  const number = (key, fallback, max) => {
    if (query[key] === undefined) return fallback;
    if (typeof query[key] !== 'string' || !/^[1-9]\d*$/.test(query[key]) || Number(query[key]) > max) invalid();
    return Number(query[key]);
  };
  return { page: number('page', 1, 10000), limit: number('limit', 20, 50) };
}
async function page(Model, filter, query, sort = { createdAt: -1, _id: -1 }) {
  const { page: current, limit } = query;
  const [rows, total] = await Promise.all([Model.find(filter).sort(sort).skip((current - 1) * limit).limit(limit).maxTimeMS(5000).lean(), Model.countDocuments(filter).maxTimeMS(5000)]);
  return { rows, pagination: { page: current, limit, total, pages: Math.ceil(total / limit) } };
}
const find = (Model, filter, session) => Model.findOne(filter).session(session ?? null);
async function circleAccess(circleId, actor, session, { lock = false } = {}) {
  const circle = await find(ReadingCircle, { _id: id(String(circleId)) }, session);
  if (!circle) missing();
  const membership = actor ? await find(Membership, { circle: circle._id, user: actor._id, status: 'active' }, session) : null;
  if (circle.visibility === 'private' && !membership && !same(circle.owner, actor?._id)) missing();
  if (lock) await ReadingCircle.updateOne({ _id: circle._id }, { $inc: { __v: 1 } }, { session });
  return { circle, membership, owner: same(circle.owner, actor?._id) };
}
async function discussionAccess(discussionId, actor, session, { lock = false, moderated = false } = {}) {
  const discussion = await find(Discussion, { _id: id(String(discussionId)) }, session).select('+restoreStatus');
  if (!discussion) missing();
  const circle = discussion.circle ? await circleAccess(discussion.circle, actor, session, { lock }) : null;
  if (['hidden', 'deleted'].includes(discussion.status) && !(moderated && await canModerate(actor, circle, session))) missing();
  if (lock) await Discussion.updateOne({ _id: discussion._id }, { $inc: { __v: 1 } }, { session });
  return { discussion, circle };
}
async function globalModerator(actor, session) {
  return Boolean(actor && await find(Moderator, { user: actor._id, revokedAt: null }, session));
}
async function canModerate(actor, access, session) {
  return Boolean(actor && (await globalModerator(actor, session) || access?.owner || access?.membership?.role === 'moderator'));
}
function writable({ discussion, circle }) {
  if (discussion.status !== 'active' || (circle && circle.circle.status !== 'active')) fail(409, 'This discussion is closed for changes.');
}
function circleContributor(access) {
  if (access.circle.status !== 'active' || !access.membership) fail(403, 'Active circle membership is required.');
}
async function saveMembershipEvent(membership, actor, session, previous) {
  const changed = !previous || previous.status !== membership.status || previous.role !== membership.role;
  if (changed && !membership.isNew) membership.increment();
  await membership.save({ session });
  if (changed) await emitNotification({ recipient: membership.user, actor: actor._id,
    type: membership.status === 'pending' ? 'circle_invitation' : 'circle_membership_changed',
    resourceType: 'circle_membership', resourceId: membership._id,
    eventKey: `membership:${membership._id}:${membership.__v ?? 0}` }, session);
}
async function authorDTO(author) {
  const user = await User.findById(author).select('displayName isActive').lean();
  return { id: String(author), displayName: user?.isActive ? user.displayName : 'Unavailable account' };
}
async function discussionDTO(row, actor) {
  let canEdit = same(row.author, actor?._id) && row.status === 'active';
  if (canEdit && row.circle) { const access = await circleAccess(row.circle, actor); canEdit = access.circle.status === 'active' && Boolean(access.membership); }
  return { id: String(row._id), author: await authorDTO(row.author), title: row.title, body: row.body,
    ...(row.bookId ? { bookId: row.bookId } : {}), ...(row.chapterNumber ? { chapterNumber: row.chapterNumber } : {}),
    ...(row.verseId ? { verseId: row.verseId } : {}), ...(row.circle ? { circleId: String(row.circle) } : {}),
    visibility: row.visibility, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt,
    commentCount: await Comment.countDocuments({ discussion: row._id, status: 'active' }),
    canEdit, canDelete: same(row.author, actor?._id) && ['active', 'locked'].includes(row.status) };
}
async function commentDTO(row, actor, open) {
  return { id: String(row._id), discussionId: String(row.discussion), author: await authorDTO(row.author), body: row.body,
    status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt, canEdit: open && same(row.author, actor?._id) };
}
async function circleDTO(row, actor) {
  const membership = actor ? await Membership.findOne({ circle: row._id, user: actor._id }).lean() : null;
  return { id: String(row._id), name: row.name, description: row.description ?? '', owner: await authorDTO(row.owner),
    visibility: row.visibility, membershipPolicy: row.membershipPolicy, status: row.status,
    membership: membership ? { role: membership.role, status: membership.status } : null,
    canManage: same(row.owner, actor?._id), createdAt: row.createdAt, updatedAt: row.updatedAt };
}
async function transaction(work) {
  if (!await supportsTransactions()) fail(503, 'Community writes require transaction-capable storage.');
  try { return await mongoose.connection.transaction(work, transactionOptions); }
  catch (error) {
    if (['ValidationError', 'StrictModeError', 'CastError'].includes(error.name)) invalid();
    if (error.code === 11000) fail(409, 'This community operation conflicts with an existing record.');
    throw error;
  }
}
async function listDiscussions(query, actor) {
  const pagination = paging(query, ['bookId', 'chapterNumber', 'verseId', 'circleId', 'status']);
  const filter = { status: { $in: ['active', 'locked'] }, visibility: 'public' };
  if (query.status !== undefined) { if (!['active', 'locked'].includes(query.status)) invalid(); filter.status = query.status; }
  const reference = { ...query };
  if (query.chapterNumber !== undefined) {
    if (typeof query.chapterNumber !== 'string' || !/^[1-9]\d*$/.test(query.chapterNumber)) invalid();
    reference.chapterNumber = Number(query.chapterNumber);
  }
  Object.assign(filter, passage(reference));
  if (query.circleId !== undefined) { await circleAccess(id(query.circleId), actor); filter.circle = query.circleId; filter.visibility = 'circle'; }
  const result = await page(Discussion, filter, pagination);
  return { items: await Promise.all(result.rows.map(row => discussionDTO(row, actor))), pagination: result.pagination };
}
async function getDiscussion(discussionId, actor) {
  const access = await discussionAccess(discussionId, actor);
  return { ...await discussionDTO(access.discussion, actor), canModerate: await canModerate(actor, access.circle),
    canComment: access.discussion.status === 'active' && (!access.circle || (access.circle.circle.status === 'active' && Boolean(access.circle.membership))) };
}
async function createDiscussion(input, actor) {
  fields(input, ['title', 'body', 'bookId', 'chapterNumber', 'verseId', 'circleId']);
  const data = { title: string(input.title, 160).trim(), body: string(input.body, 10000), ...passage(input), author: actor._id, visibility: 'public' };
  const row = await transaction(async session => {
    if (input.circleId !== undefined) {
      const access = await circleAccess(id(input.circleId), actor, session, { lock: true }); circleContributor(access);
      data.circle = access.circle._id; data.visibility = 'circle';
    }
    return (await Discussion.create([data], { session }))[0];
  });
  return discussionDTO(row, actor);
}
async function changeDiscussion(discussionId, input, actor, remove = false) {
  fields(input, remove ? [] : ['title', 'body']); if (!remove && !Object.keys(input).length) invalid();
  const row = await transaction(async session => {
    const access = await discussionAccess(discussionId, actor, session, { lock: true });
    if (!same(access.discussion.author, actor._id)) missing();
    // Authors may withdraw locked content; moderator-hidden/deleted content stays unavailable.
    if (!remove) { writable(access); if (access.circle) circleContributor(access.circle); }
    if (remove) access.discussion.status = 'deleted';
    else { if (input.title !== undefined) access.discussion.title = string(input.title, 160).trim(); if (input.body !== undefined) access.discussion.body = string(input.body, 10000); }
    await access.discussion.save({ session }); return access.discussion;
  });
  return remove ? { message: 'Discussion removed.' } : discussionDTO(row, actor);
}
async function listComments(discussionId, query, actor) {
  const pagination = paging(query); const access = await discussionAccess(discussionId, actor);
  const result = await page(Comment, { discussion: access.discussion._id, status: 'active' }, pagination, { createdAt: 1, _id: 1 });
  const open = access.discussion.status === 'active' && (!access.circle || (access.circle.circle.status === 'active' && Boolean(access.circle.membership)));
  return { items: await Promise.all(result.rows.map(row => commentDTO(row, actor, open))), pagination: result.pagination };
}
async function createComment(discussionId, input, actor) {
  fields(input, ['body']); const body = string(input.body, 5000);
  const row = await transaction(async session => {
    const access = await discussionAccess(discussionId, actor, session, { lock: true }); writable(access);
    if (access.circle) circleContributor(access.circle);
    const comment = (await Comment.create([{ discussion: access.discussion._id, author: actor._id, body }], { session }))[0];
    await emitNotification({ recipient: access.discussion.author, actor: actor._id, type: 'discussion_comment', resourceType: 'comment', resourceId: comment._id, eventKey: `comment:${comment._id}` }, session);
    return comment;
  });
  return commentDTO(row, actor, true);
}
async function changeComment(commentId, input, actor, remove = false) {
  fields(input, remove ? [] : ['body']);
  const row = await transaction(async session => {
    const comment = await find(Comment, { _id: id(commentId), status: 'active' }, session); if (!comment) missing();
    const access = await discussionAccess(comment.discussion, actor, session, { lock: true });
    if (!same(comment.author, actor._id)) missing(); if (!remove) { writable(access); if (access.circle) circleContributor(access.circle); }
    if (remove) comment.status = 'deleted'; else comment.body = string(input.body, 5000);
    await comment.save({ session }); return comment;
  });
  return remove ? { message: 'Comment removed.' } : commentDTO(row, actor, true);
}
async function listCircles(query, actor) {
  const pagination = paging(query, ['scope']); if (query.scope !== undefined && !['mine', 'invitations'].includes(query.scope)) invalid();
  let result;
  if (query.scope) {
    if (!actor) fail(401, 'Please log in.');
    const [found] = await Membership.aggregate([
      { $match: { user: actor._id, status: query.scope === 'mine' ? 'active' : 'pending' } },
      { $lookup: { from: ReadingCircle.collection.name, localField: 'circle', foreignField: '_id', as: 'circleData' } },
      { $unwind: '$circleData' }, { $replaceRoot: { newRoot: '$circleData' } }, { $sort: { createdAt: -1, _id: -1 } },
      { $facet: { rows: [{ $skip: (pagination.page - 1) * pagination.limit }, { $limit: pagination.limit }], total: [{ $count: 'value' }] } },
    ]).option({ maxTimeMS: 5000 });
    const total = found.total[0]?.value ?? 0;
    result = { rows: found.rows, pagination: { ...pagination, total, pages: Math.ceil(total / pagination.limit) } };
  } else result = await page(ReadingCircle, { visibility: 'public', status: 'active' }, pagination);
  return { items: await Promise.all(result.rows.map(async row => {
    const dto = await circleDTO(row, actor); if (query.scope === 'invitations') dto.description = ''; return dto;
  })), pagination: result.pagination };
}
async function getCircle(circleId, actor) { return circleDTO((await circleAccess(circleId, actor)).circle, actor); }
async function createCircle(input, actor) {
  fields(input, ['name', 'description', 'visibility', 'membershipPolicy']);
  const data = { name: string(input.name, 100).trim(), description: string(input.description ?? '', 2000, false),
    visibility: input.visibility, membershipPolicy: input.membershipPolicy, owner: actor._id };
  const row = await transaction(async session => {
    const circle = (await ReadingCircle.create([data], { session }))[0];
    await Membership.create([{ circle: circle._id, user: actor._id, role: 'owner', status: 'active', joinedAt: new Date() }], { session }); return circle;
  });
  return circleDTO(row, actor);
}
async function changeCircle(circleId, input, actor) {
  fields(input, ['name', 'description', 'status']); if (!Object.keys(input).length) invalid();
  const row = await transaction(async session => {
    const access = await circleAccess(circleId, actor, session, { lock: true }); if (!access.owner) missing();
    if (access.circle.status !== 'active') fail(409, 'Archived circles cannot be changed.');
    if (input.name !== undefined) access.circle.name = string(input.name, 100).trim();
    if (input.description !== undefined) access.circle.description = string(input.description, 2000, false);
    if (input.status !== undefined) { if (input.status !== 'archived') invalid(); access.circle.status = 'archived'; }
    await access.circle.save({ session }); return access.circle;
  }); return circleDTO(row, actor);
}
async function joinCircle(circleId, input, actor) {
  fields(input, []);
  return transaction(async session => {
    const circle = await find(ReadingCircle, { _id: id(circleId), status: 'active' }, session); if (!circle) missing();
    const membership = await find(Membership, { circle: circle._id, user: actor._id }, session);
    if (membership?.blocked || ((circle.visibility === 'private' || circle.membershipPolicy === 'invitation') && !['pending', 'active'].includes(membership?.status))) missing();
    await ReadingCircle.updateOne({ _id: circle._id }, { $inc: { __v: 1 } }, { session });
    if (membership?.status === 'active') return { message: 'Already a member.' };
    if (membership) {
      const previous = { status: membership.status, role: membership.role };
      membership.status = 'active'; membership.joinedAt = new Date(); await saveMembershipEvent(membership, actor, session, previous);
    }
    else await Membership.create([{ circle: circle._id, user: actor._id, role: 'member', status: 'active', joinedAt: new Date() }], { session });
    return { message: 'Joined circle.' };
  });
}
async function leaveCircle(circleId, input, actor) {
  fields(input, []);
  return transaction(async session => {
    const invitation = await find(Membership, { circle: id(circleId), user: actor._id, status: 'pending' }, session);
    if (invitation) {
      const circle = await find(ReadingCircle, { _id: circleId }, session); if (!circle) missing();
      await ReadingCircle.updateOne({ _id: circleId }, { $inc: { __v: 1 } }, { session });
      const previous = { status: invitation.status, role: invitation.role };
      invitation.status = 'removed'; invitation.role = 'member'; await saveMembershipEvent(invitation, actor, session, previous);
      return { message: 'Invitation declined.' };
    }
    const access = await circleAccess(circleId, actor, session, { lock: true }); if (!access.membership) missing();
    if (access.owner) { access.circle.status = 'archived'; await access.circle.save({ session }); }
    const previous = { status: access.membership.status, role: access.membership.role };
    access.membership.status = 'removed'; access.membership.role = access.owner ? 'owner' : 'member';
    await saveMembershipEvent(access.membership, actor, session, previous); return { message: access.owner ? 'Circle archived. You have left; ownership remains for accountability.' : 'Left circle.' };
  });
}
async function members(circleId, query, actor) {
  const pagination = paging(query); const access = await circleAccess(circleId, actor);
  if (!access.membership && !access.owner) missing();
  const result = await page(Membership, { circle: circleId, status: { $in: ['active', 'pending'] } }, pagination, { createdAt: 1, _id: 1 });
  return { items: await Promise.all(result.rows.map(async row => ({ user: await authorDTO(row.user), role: row.role, status: row.status, joinedAt: row.joinedAt ?? null }))), pagination: result.pagination };
}
async function manageMember(circleId, userId, input, actor) {
  fields(input, ['action']); if (!['invite', 'remove', 'promote', 'demote'].includes(input.action)) invalid(); id(userId);
  return transaction(async session => {
    const access = await circleAccess(circleId, actor, session, { lock: true });
    if (!access.owner || access.circle.status !== 'active') missing();
    if (same(access.circle.owner, userId)) fail(403, 'Owner membership cannot be reassigned.');
    if (!await find(User, { _id: userId, isActive: true }, session)) missing();
    let membership = await find(Membership, { circle: circleId, user: userId }, session);
    const previous = membership ? { status: membership.status, role: membership.role } : null;
    if (input.action === 'invite') {
      if (membership?.status === 'active') fail(409, 'This account is already a member.');
      if (!membership) membership = new Membership({ circle: circleId, user: userId });
      membership.status = 'pending'; membership.role = 'member'; membership.blocked = false;
    } else {
      if (!membership || (input.action === 'remove' ? !['active', 'pending'].includes(membership.status) : membership.status !== 'active')) missing();
      if (input.action === 'remove') { membership.status = 'removed'; membership.role = 'member'; membership.blocked = true; }
      else membership.role = input.action === 'promote' ? 'moderator' : 'member';
    }
    await saveMembershipEvent(membership, actor, session, previous); return { message: 'Membership updated.' };
  });
}
async function targetAccess(type, targetId, actor, session, moderated = false) {
  if (type === 'article') {
    await require('./articleStorage').assertArticleStorage();
    if (moderated) await requireModerator(actor, session);
    const Article = require('../models/Article');
    const article = await find(Article, { _id: id(targetId), ...(moderated ? {} : { status: 'published' }) }, session);
    if (!article) missing();
    if (session) await Article.updateOne({ _id: article._id }, { $inc: { __v: 1 } }, { session, timestamps: false });
    return { article, target: article, circle: null };
  }
  if (!['discussion', 'comment'].includes(type)) invalid();
  let target;
  if (type === 'comment') { target = await find(Comment, { _id: id(targetId) }, session); if (!target || (!moderated && target.status !== 'active')) missing(); }
  const access = await discussionAccess(type === 'discussion' ? id(targetId) : target.discussion, actor, session, { lock: Boolean(session), moderated });
  return { ...access, target: target ?? access.discussion };
}
async function report(input, actor) {
  fields(input, ['targetType', 'targetId', 'reason', 'details']);
  if (!['spam', 'harassment', 'hate', 'other'].includes(input.reason)) invalid();
  const details = string(input.details ?? '', 1000, false);
  // A single report per account and target for its lifetime. Duplicate submissions do not overwrite details.
  return transaction(async session => {
    const access = await targetAccess(input.targetType, input.targetId, actor, session);
    const filter = { reporter: actor._id, targetType: input.targetType, targetId: input.targetId };
    let row = await find(Report, filter, session);
    if (!row) row = (await Report.create([{ ...filter, reason: input.reason, details, ...(access.discussion?.circle ? { circle: access.discussion.circle } : {}) }], { session }))[0];
    return { id: String(row._id), status: row.status };
  });
}
async function requireModerator(actor, session) { if (!await globalModerator(actor, session)) fail(403, 'Moderator access is required.'); }
async function reports(query, actor) {
  const pagination = paging(query, ['status', 'circleId', 'targetType', 'reason', 'start', 'end']);
  if (query.circleId !== undefined) {
    const access = await circleAccess(id(query.circleId), actor);
    if (!await canModerate(actor, access)) fail(403, 'Moderator access is required.');
  } else await requireModerator(actor);
  const status = query.status ?? 'open'; if (!['open', 'reviewed', 'resolved'].includes(status)) invalid();
  if (query.targetType !== undefined && !['discussion', 'comment', 'article'].includes(query.targetType)) invalid();
  if (query.reason !== undefined && !['spam', 'harassment', 'hate', 'other'].includes(query.reason)) invalid();
  // Filter private-circle reports inside MongoDB before counting/paginating;
  // never gather every circle or membership into an unbounded application list.
  const [result] = await Report.aggregate([
    { $match: { status, ...moderationDates(query), ...(query.targetType ? { targetType: query.targetType } : {}), ...(query.reason ? { reason: query.reason } : {}), ...(query.circleId ? { circle: new mongoose.Types.ObjectId(query.circleId) } : {}) } },
    ...circleVisibilityStages(actor),
    { $sort: { createdAt: 1, _id: 1 } },
    { $facet: { rows: [{ $skip: (pagination.page - 1) * pagination.limit }, { $limit: pagination.limit }], total: [{ $count: 'value' }] } },
  ]).option({ maxTimeMS: 5000 });
  const total = result.total[0]?.value ?? 0;
  const items = await Promise.all(result.rows.map(async row => {
    if (row.targetType === 'article') {
      const target = await require('../models/Article').findById(row.targetId).select('title body status slug revision').lean();
      return { id: String(row._id), targetType: row.targetType, targetId: String(row.targetId), reason: row.reason, details: row.details ?? '', status: row.status, createdAt: row.createdAt,
        context: target ? { articleId: String(target._id), articleSlug: target.slug, title: target.title, body: target.body, status: target.status, revision: target.revision } : null };
    }
    const target = await (row.targetType === 'discussion' ? Discussion : Comment).findById(row.targetId).select('title body status discussion').lean();
    return { id: String(row._id), targetType: row.targetType, targetId: String(row.targetId), reason: row.reason, details: row.details ?? '', status: row.status, createdAt: row.createdAt,
      context: target ? { body: target.body, status: target.status, ...(target.title ? { title: target.title } : {}), discussionId: row.targetType === 'discussion' ? String(row.targetId) : String(target.discussion) } : null };
  }));
  return { items,
    pagination: { ...pagination, total, pages: Math.ceil(total / pagination.limit) } };
}
async function reviewReport(reportId, input, actor) {
  fields(input, ['status', 'reason']); if (!['reviewed', 'resolved'].includes(input.status)) invalid(); string(input.reason, 1000);
  return transaction(async session => {
    const row = await find(Report, { _id: id(reportId) }, session); if (!row) missing();
    if (row.circle) {
      const access = await circleAccess(row.circle, actor, session, { lock: true });
      if (!await canModerate(actor, access, session)) fail(403, 'Moderator access is required.');
    } else await requireModerator(actor, session);
    if (same(row.reporter, actor._id)) fail(403, 'You cannot review your own report.');
    if (row.status === input.status) return { message: 'Report already has this status.' };
    if (row.status === 'resolved') fail(409, 'Resolved reports cannot be reopened.');
    const previousStatus = row.status; row.status = input.status; await row.save({ session });
    await Audit.create([{ moderator: actor._id, targetType: 'report', targetId: row._id, action: input.status === 'resolved' ? 'resolve' : 'review', reason: input.reason, previousStatus, resultingStatus: row.status }], { session });
    await emitNotification({ recipient: row.reporter, actor: actor._id, type: input.status === 'resolved' ? 'report_resolved' : 'report_reviewed',
      resourceType: 'report', resourceId: row._id, eventKey: `report:${row._id}:${input.status}` }, session);
    return { message: 'Report updated.' };
  });
}
async function moderate(input, actor) {
  fields(input, ['targetType', 'targetId', 'action', 'reason']); string(input.reason, 1000);
  if (input.targetType === 'article') fail(400, 'Use the article review endpoint with the reviewed revision.');
  if (!['hide', 'restore', 'lock', 'unlock', 'delete'].includes(input.action)) invalid();
  return transaction(async session => {
    const access = await targetAccess(input.targetType, input.targetId, actor, session, true);
    if (!await canModerate(actor, access.circle, session)) fail(403, 'Moderator access is required.');
    if (same(access.target.author, actor._id)) fail(403, 'Another moderator must review your content.');
    const row = access.target, previousStatus = row.status;
    if (input.action === 'hide' && ['active', 'locked'].includes(row.status)) { if (input.targetType === 'discussion') row.restoreStatus = row.status; row.status = 'hidden'; }
    else if (input.action === 'restore' && row.status === 'hidden') row.status = input.targetType === 'discussion' ? row.restoreStatus : 'active';
    else if (input.action === 'lock' && input.targetType === 'discussion' && row.status === 'active') row.status = 'locked';
    else if (input.action === 'unlock' && input.targetType === 'discussion' && row.status === 'locked') row.status = 'active';
    else if (input.action === 'delete' && row.status !== 'deleted') row.status = 'deleted';
    else fail(409, 'Invalid moderation state transition.');
    await row.save({ session });
    const audit = (await Audit.create([{ moderator: actor._id, targetType: input.targetType, targetId: row._id, action: input.action, reason: input.reason, previousStatus, resultingStatus: row.status }], { session }))[0];
    await emitNotification({ recipient: row.author, actor: actor._id, type: 'content_moderated', resourceType: input.targetType, resourceId: row._id, eventKey: `moderation:${audit._id}` }, session);
    return { message: 'Moderation action recorded.' };
  });
}
async function audit(query, actor) {
  const pagination = paging(query, ['targetType', 'targetId']);
  if (!['discussion', 'comment', 'article'].includes(query.targetType)) invalid();
  const access = await targetAccess(query.targetType, query.targetId, actor, undefined, true);
  if (!await canModerate(actor, access.circle)) fail(403, 'Moderator access is required.');
  const result = await page(Audit, { targetType: query.targetType, targetId: query.targetId }, pagination);
  return { items: result.rows.map(row => ({ id: String(row._id), moderatorId: String(row.moderator), action: row.action, reason: row.reason, previousStatus: row.previousStatus, resultingStatus: row.resultingStatus, createdAt: row.createdAt })), pagination: result.pagination };
}
module.exports = { circleAccess, authorDTO, listDiscussions, getDiscussion, createDiscussion, changeDiscussion, listComments, createComment, changeComment,
  listCircles, getCircle, createCircle, changeCircle, joinCircle, leaveCircle, members, manageMember, report, reports, reviewReport, moderate, audit, globalModerator };
