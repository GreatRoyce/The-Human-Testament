const User = require('../models/User');
const Discussion = require('../models/Discussion');
const Comment = require('../models/Comment');
const Article = require('../models/Article');
const Membership = require('../models/CircleMembership');
const Circle = require('../models/ReadingCircle');
const Report = require('../models/ContentReport');
const find = (Model, filter, session) => Model.findOne(filter).session(session ?? null).lean();
const same = (left, right) => Boolean(left && right && String(left) === String(right));
async function circleVisible(circleId, user, session) {
  try { await require('./community.service').circleAccess(circleId, user, session); return true; }
  catch (error) { if (error.status === 404) return false; throw error; }
}
// No copied titles, prose, review reasons or private notes are needed to decide
// access. Re-evaluate the live resource both at creation and at each inbox read.
async function notificationAccess(notification, user, session) {
  const { type, resourceType, resourceId } = notification;
  if (resourceType === 'article') {
    const article = await find(Article, { _id: resourceId, author: user._id }, session);
    return article ? { targetUrl: `/articles/mine/${article._id}`, showActor: false } : null;
  }
  if (resourceType === 'report') {
    const report = await find(Report, { _id: resourceId, reporter: user._id }, session);
    // A private acknowledgement of one's own case; no case target, moderator
    // identity, circle reference or internal review reason leaves this service.
    return report ? { targetUrl: null, showActor: false } : null;
  }
  if (resourceType === 'circle_membership') {
    const membership = await find(Membership, { _id: resourceId, user: user._id }, session);
    if (!membership) return null;
    const circle = await find(Circle, { _id: membership.circle }, session); if (!circle) return null;
    if (membership.status === 'pending' && circle.status === 'active') return { targetUrl: '/community/reading-circles?scope=invitations', showActor: true };
    if (membership.status === 'active' || same(circle.owner, user._id)) return { targetUrl: `/community/reading-circles/${circle._id}`, showActor: true };
    // Removal is still the recipient's own membership event. Its generic
    // acknowledgement carries neither a circle ID nor an actor or private link.
    return type === 'circle_membership_changed' ? { targetUrl: null, showActor: false } : null;
  }
  let discussion, comment;
  if (resourceType === 'comment') {
    comment = await find(Comment, { _id: resourceId }, session); if (!comment) return null;
    discussion = await find(Discussion, { _id: comment.discussion }, session);
  } else if (resourceType === 'discussion') discussion = await find(Discussion, { _id: resourceId }, session);
  if (!discussion || (discussion.circle && !await circleVisible(discussion.circle, user, session))) return null;
  if (type === 'discussion_comment') {
    if (!same(discussion.author, user._id) || comment?.status !== 'active' || !['active', 'locked'].includes(discussion.status)) return null;
  } else if (type === 'content_moderated') {
    if (!same(comment?.author ?? discussion.author, user._id)) return null;
  } else return null;
  const readable = ['active', 'locked'].includes(discussion.status) && (!comment || comment.status === 'active');
  return { targetUrl: readable ? `/community/discussions/${discussion._id}` : null, showActor: type === 'discussion_comment' };
}
async function recipientForNotification(id, session) { return User.findOne({ _id: id, isActive: true }).select('_id isActive').session(session ?? null).lean(); }
module.exports = { notificationAccess, recipientForNotification };
