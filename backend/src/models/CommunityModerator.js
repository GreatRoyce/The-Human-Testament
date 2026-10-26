// Trusted operator grants only. No HTTP endpoint can create or update a grant.
const mongoose = require('mongoose');
const { options, ref, text } = require('./communityFields');
const schema = new mongoose.Schema({ user: ref('User'), grantedBy: { ...text(100), immutable: true },
  reason: { ...text(1000), immutable: true }, revokedAt: Date, revokedBy: text(100, false), revocationReason: text(1000, false) }, options);
schema.index({ user: 1 }, { unique: true, name: 'community_moderator_user_unique' });
module.exports = mongoose.model('CommunityModerator', schema);
