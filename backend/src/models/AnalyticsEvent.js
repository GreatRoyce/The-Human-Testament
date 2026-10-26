const mongoose = require('mongoose');
const hash = { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true, select: false };
const schema = new mongoose.Schema({
  eventHash: hash, visitorHash: hash, sessionHash: hash,
  path: { type: String, required: true, maxlength: 200, immutable: true },
  contentType: { type: String, required: true, enum: ['site', 'book', 'chapter', 'verse', 'materials', 'search', 'community', 'articles', 'article'], immutable: true },
  referral: { type: String, required: true, maxlength: 253, immutable: true },
  authenticated: { type: Boolean, required: true, immutable: true },
  occurredAt: { type: Date, required: true, immutable: true }, expiresAt: { type: Date, required: true, immutable: true },
}, { strict: 'throw', autoIndex: false, autoCreate: false, versionKey: false,
  toJSON: { transform: (_doc, ret) => { delete ret.eventHash; delete ret.visitorHash; delete ret.sessionHash; return ret; } },
  toObject: { transform: (_doc, ret) => { delete ret.eventHash; delete ret.visitorHash; delete ret.sessionHash; return ret; } } });
schema.index({ eventHash: 1 }, { unique: true, name: 'analytics_event_unique' });
schema.index({ occurredAt: 1, path: 1 }, { name: 'analytics_time_path' });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'analytics_expiry' });
module.exports = mongoose.model('AnalyticsEvent', schema);
