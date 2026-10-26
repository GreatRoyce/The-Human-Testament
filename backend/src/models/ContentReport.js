const mongoose = require('mongoose');
const { options, ref, text } = require('./communityFields');
const schema = new mongoose.Schema({ reporter: ref('User'),
  targetType: { type: String, enum: ['discussion', 'comment', 'article'], required: true, immutable: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  circle: { type: mongoose.Schema.Types.ObjectId, ref: 'ReadingCircle', immutable: true },
  reason: { type: String, enum: ['spam', 'harassment', 'hate', 'other'], required: true }, details: text(1000, false),
  status: { type: String, enum: ['open', 'reviewed', 'resolved'], default: 'open', required: true } }, options);
schema.index({ reporter: 1, targetType: 1, targetId: 1 }, { name: 'report_reporter_target_unique', unique: true });
schema.index({ status: 1, createdAt: 1, _id: 1 }, { name: 'report_review_queue' });
module.exports = mongoose.model('ContentReport', schema);
