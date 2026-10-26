const mongoose = require('mongoose');
const privateOwner = require('./privateOwner');
const { isCanonicalReference } = require('../utils/canonicalReference');
const MAX_NOTE_LENGTH = 5000;
const schema = new mongoose.Schema({
  verseId: { type: String, cast: false, required: true, immutable: true,
    validate: { validator: isCanonicalReference, message: 'Canonical verse not found.' } },
  // Preserve the author's text exactly, including leading spaces and newlines.
  content: { type: String, cast: false, required: true, maxlength: MAX_NOTE_LENGTH,
    validate: { validator: value => typeof value === 'string' && /\S/u.test(value), message: 'Note content must not be blank.' } },
}, { timestamps: true, strict: 'throw', autoCreate: false, autoIndex: false });
schema.plugin(privateOwner, { field: 'user' });
schema.index({ user: 1, createdAt: -1, _id: -1 }, { name: 'private_note_user_recent' });
schema.index({ user: 1, verseId: 1, createdAt: -1, _id: -1 }, { name: 'private_note_user_verse_recent' });
module.exports = mongoose.model('PrivateNote', schema);
module.exports.MAX_NOTE_LENGTH = MAX_NOTE_LENGTH;
