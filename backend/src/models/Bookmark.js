const mongoose = require('mongoose');
const privateOwner = require('./privateOwner');
const { isCanonicalReference } = require('../utils/canonicalReference');
const schema = new mongoose.Schema({
  verseId: { type: String, cast: false, required: true, immutable: true,
    validate: { validator: isCanonicalReference, message: 'Canonical verse not found.' } },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw', autoCreate: false, autoIndex: false });
schema.plugin(privateOwner, { field: 'user' });
schema.index({ user: 1, verseId: 1 }, { unique: true, name: 'bookmark_user_verse_unique' });
schema.index({ user: 1, createdAt: -1, _id: -1 }, { name: 'bookmark_user_recent' });
module.exports = mongoose.model('Bookmark', schema);
