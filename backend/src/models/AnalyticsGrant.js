// Existing operator-managed Owner/Admin grants. Platform administration is a
// separate explicit permission on Admin grants; old analytics grants stay scoped.
const mongoose = require('mongoose');
const { options, ref, text } = require('./communityFields');
const schema = new mongoose.Schema({ user: ref('User'), role: { type: String, required: true, enum: ['owner', 'admin'], immutable: true },
  administration: { type: Boolean, default: false, required: true, validate: { validator: function (value) { return !value || this.role === 'admin'; }, message: 'Only an Admin grant may carry administration permission.' } },
  grantedBy: { ...text(100), immutable: true }, reason: { ...text(1000), immutable: true }, revokedAt: Date,
  revokedBy: text(100, false), revocationReason: text(1000, false) }, options);
schema.index({ user: 1, role: 1 }, { unique: true, name: 'analytics_user_role_unique' });
module.exports = mongoose.model('AnalyticsGrant', schema);
