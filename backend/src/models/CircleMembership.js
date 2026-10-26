const mongoose = require('mongoose');
const { options, ref } = require('./communityFields');
const schema = new mongoose.Schema({ circle: ref('ReadingCircle'), user: ref('User'),
  role: { type: String, enum: ['member', 'moderator', 'owner'], required: true, default: 'member' },
  status: { type: String, enum: ['pending', 'active', 'removed'], required: true, default: 'pending' },
  joinedAt: Date, blocked: { type: Boolean, default: false } }, options);
schema.index({ circle: 1, user: 1 }, { unique: true, name: 'circle_user_unique' });
schema.index({ user: 1, status: 1, circle: 1 }, { name: 'membership_user_status' });
module.exports = mongoose.model('CircleMembership', schema);
