const mongoose = require('mongoose');
const { options, ref } = require('./communityFields');
const messages = Object.freeze({
  discussion_comment: 'Someone commented on your discussion.',
  article_approved: 'Your article was approved for publication.',
  article_rejected: 'Your article was returned with a review decision.',
  content_moderated: 'Moderation changed the availability of your content.',
  circle_invitation: 'You were invited to a reading circle.',
  circle_membership_changed: 'Your reading-circle membership or role changed.',
  report_reviewed: 'A report you submitted was reviewed.',
  report_resolved: 'A report you submitted was resolved.',
});
const schema = new mongoose.Schema({ recipient: ref('User'),
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', immutable: true },
  type: { type: String, cast: false, enum: Object.keys(messages), required: true, immutable: true },
  resourceType: { type: String, cast: false, enum: ['discussion', 'comment', 'article', 'circle_membership', 'report'], required: true, immutable: true },
  resourceId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  message: { type: String, cast: false, enum: Object.values(messages), maxlength: 120, immutable: true },
  eventKey: { type: String, cast: false, required: true, immutable: true, select: false, maxlength: 100,
    match: /^[a-z_]+:[a-f0-9]{24}(?::(?:[0-9]+|reviewed|resolved))?$/ },
  readAt: { type: Date, default: null },
}, { ...options, timestamps: { createdAt: true, updatedAt: false } });
schema.pre('validate', function () {
  const expected = { discussion_comment: ['comment'], article_approved: ['article'], article_rejected: ['article'],
    content_moderated: ['discussion', 'comment', 'article'], circle_invitation: ['circle_membership'], circle_membership_changed: ['circle_membership'], report_reviewed: ['report'], report_resolved: ['report'] };
  if (!expected[this.type]?.includes(this.resourceType)) this.invalidate('resourceType', 'Invalid notification event resource.');
  if (this.message !== undefined && this.message !== messages[this.type]) this.invalidate('message', 'Notification text must match its event.');
});
schema.index({ recipient: 1, eventKey: 1 }, { unique: true, name: 'notification_recipient_event_unique' });
schema.index({ recipient: 1, createdAt: -1, _id: -1 }, { name: 'notification_recipient_recent' });
schema.index({ recipient: 1, readAt: 1, createdAt: -1, _id: -1 }, { name: 'notification_recipient_unread' });
module.exports = mongoose.model('Notification', schema);
module.exports.messages = messages;
