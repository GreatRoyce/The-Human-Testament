const mongoose = require('mongoose');
const { options, ref, text } = require('./communityFields');
const { isCanonicalBook, isCanonicalLocation, isCanonicalReference } = require('../utils/canonicalReference');
const schema = new mongoose.Schema({
  author: ref('User'), title: { ...text(160), trim: true }, body: text(10000),
  bookId: { type: String, cast: false, immutable: true },
  chapterNumber: { type: Number, immutable: true }, verseId: { type: String, cast: false, immutable: true },
  circle: { type: mongoose.Schema.Types.ObjectId, ref: 'ReadingCircle', immutable: true },
  visibility: { type: String, enum: ['public', 'circle'], required: true, immutable: true },
  status: { type: String, enum: ['active', 'locked', 'hidden', 'deleted'], default: 'active', required: true },
  restoreStatus: { type: String, enum: ['active', 'locked'], default: 'active', select: false },
}, options);
schema.pre('validate', function () {
  if ((this.visibility === 'circle') !== Boolean(this.circle)) this.invalidate('visibility', 'Circle visibility requires a circle.');
  if (this.bookId !== undefined && !isCanonicalBook(this.bookId)) this.invalidate('bookId', 'Canonical book not found.');
  if (this.chapterNumber !== undefined && !isCanonicalLocation(this.bookId, this.chapterNumber)) this.invalidate('chapterNumber', 'Canonical chapter not found.');
  if (this.verseId !== undefined && (!isCanonicalReference(this.verseId) || this.verseId.split(':')[0] !== this.bookId || Number(this.verseId.split(':')[1]) !== this.chapterNumber)) this.invalidate('verseId', 'Passage references are inconsistent.');
});
schema.index({ visibility: 1, status: 1, createdAt: -1, _id: -1 }, { name: 'discussion_public_recent' });
schema.index({ circle: 1, status: 1, createdAt: -1, _id: -1 }, { name: 'discussion_circle_recent' });
schema.index({ bookId: 1, chapterNumber: 1, verseId: 1, status: 1, createdAt: -1, _id: -1 }, { name: 'discussion_passage_recent' });
module.exports = mongoose.model('Discussion', schema);
