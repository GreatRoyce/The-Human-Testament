const mongoose = require('mongoose');
function hideHash(document, value) { delete value.tokenHash; return value; }
// Shared credential lifecycle, with a separate collection and indexes per use.
module.exports = function accountTokenSchema(prefix) {
  const schema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, cast: false, required: true, select: false,
      validate: value => typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value) },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
    deliveryStatus: { type: String, enum: ['pending', 'accepted', 'failed', 'disabled'], default: 'pending', required: true },
  }, { timestamps: true, autoCreate: false, autoIndex: false, strict: 'throw',
    toJSON: { transform: hideHash }, toObject: { transform: hideHash } });
  schema.index({ tokenHash: 1 }, { unique: true, name: `${prefix}_hash_unique` });
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: `${prefix}_expiry` });
  schema.index({ user: 1, usedAt: 1, invalidatedAt: 1 });
  return schema;
};
