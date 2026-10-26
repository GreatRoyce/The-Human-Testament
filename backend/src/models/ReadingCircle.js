const mongoose = require('mongoose');
const { options, ref, text } = require('./communityFields');
const schema = new mongoose.Schema({ name: { ...text(100), trim: true }, description: text(2000, false), owner: ref('User'),
  visibility: { type: String, enum: ['public', 'private'], required: true, immutable: true },
  membershipPolicy: { type: String, enum: ['open', 'invitation'], required: true, immutable: true },
  status: { type: String, enum: ['active', 'archived'], default: 'active', required: true } }, options);
schema.pre('validate', function () {
  if (this.visibility === 'private' && this.membershipPolicy !== 'invitation') this.invalidate('membershipPolicy', 'Private circles require invitations.');
});
schema.index({ visibility: 1, status: 1, createdAt: -1, _id: -1 }, { name: 'circle_public_recent' });
module.exports = mongoose.model('ReadingCircle', schema);
