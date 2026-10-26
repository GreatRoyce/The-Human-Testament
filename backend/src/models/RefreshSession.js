const mongoose = require('mongoose');
function hideToken(document, value) { delete value.tokenHash; return value; }
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, cast: false, required: true, select: false,
    validate: value => typeof value === 'string' && value.length === 64 && /^[a-f0-9]+$/.test(value) },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true, autoCreate: false, autoIndex: false, strict: 'throw',
  toJSON: { transform: hideToken }, toObject: { transform: hideToken } });
schema.index({ tokenHash: 1 }, { unique: true, name: 'refresh_token_hash_unique' });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'refresh_session_expiry' });
module.exports = mongoose.model('RefreshSession', schema);
