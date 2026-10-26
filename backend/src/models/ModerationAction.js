const mongoose = require('mongoose');
const { options, ref, text } = require('./communityFields');
const schema = new mongoose.Schema({ moderator: ref('User'),
  targetType: { type: String, enum: ['discussion', 'comment', 'report', 'article', 'user', 'admin_permission'], required: true, immutable: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  action: { type: String, enum: ['hide', 'restore', 'lock', 'unlock', 'delete', 'review', 'resolve', 'approve', 'reject', 'unpublish', 'archive', 'activate', 'deactivate', 'grant_admin', 'revoke_admin'], required: true, immutable: true },
  articleRevision: { type: Number, immutable: true },
  reason: { ...text(1000), immutable: true }, previousStatus: { type: String, immutable: true }, resultingStatus: { type: String, immutable: true },
  source: { type: String, enum: ['moderation', 'administration', 'operator'], immutable: true },
  operatorLabel: { ...text(100, false), immutable: true } }, { ...options, timestamps: { createdAt: true, updatedAt: false } });
schema.index({ targetType: 1, targetId: 1, createdAt: -1, _id: -1 }, { name: 'moderation_target_history' });
schema.index({ createdAt: -1, _id: -1 }, { name: 'moderation_recent' });
const immutable = () => { throw Object.assign(new Error('Audit history is append-only.'), { status: 403 }); };
schema.pre('validate', function () { if (!this.isNew) immutable(); });
schema.pre('save', function () { if (!this.isNew) immutable(); });
for (const operation of ['updateOne', 'updateMany', 'replaceOne', 'findOneAndUpdate', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'bulkWrite']) schema.pre(operation, immutable);
schema.pre('deleteOne', { document: true, query: false }, immutable);
module.exports = mongoose.model('ModerationAction', schema);
