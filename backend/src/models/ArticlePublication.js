// Approved snapshots survive unpublication, subsequent edits and archival.
const mongoose = require('mongoose');
const { options, ref, text } = require('./communityFields');
const { contentFields } = require('./articleContent');
const schema = new mongoose.Schema({ article: ref('Article'), author: ref('User'), approvedBy: ref('User'),
  revision: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  slug: { type: String, required: true, immutable: true }, publishedAt: { type: Date, required: true, immutable: true },
  content: { type: new mongoose.Schema(contentFields, { _id: false, strict: 'throw', versionKey: false }), required: true, immutable: true },
  reason: { ...text(1000), immutable: true },
}, { ...options, timestamps: { createdAt: true, updatedAt: false } });
schema.index({ article: 1, revision: 1 }, { unique: true, name: 'article_publication_revision_unique' });
schema.index({ article: 1, createdAt: -1, _id: -1 }, { name: 'article_publication_history' });
module.exports = mongoose.model('ArticlePublication', schema);
