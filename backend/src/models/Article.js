const mongoose = require('mongoose');
const { options, ref, text } = require('./communityFields');
const { contentFields } = require('./articleContent');
const schema = new mongoose.Schema({ author: ref('User'), ...contentFields,
  slug: { type: String, cast: false, required: true, immutable: true, maxlength: 100, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  status: { type: String, enum: ['draft', 'pending_review', 'published', 'rejected', 'archived'], default: 'draft', required: true },
  revision: { type: Number, default: 0, required: true, min: 0, validate: Number.isSafeInteger },
  publishedAt: Date, reviewReason: { ...text(1000, false), default: '', select: false },
}, options);
schema.index({ slug: 1 }, { unique: true, name: 'article_slug_unique' });
schema.index({ author: 1, createdAt: -1, _id: -1 }, { name: 'article_author_recent' });
schema.index({ status: 1, publishedAt: -1, _id: -1 }, { name: 'article_public_recent' });
schema.index({ status: 1, createdAt: 1, _id: 1 }, { name: 'article_review_queue' });
schema.index({ tags: 1, status: 1, publishedAt: -1, _id: -1 }, { name: 'article_tag_recent' });
schema.index({ category: 1, status: 1, publishedAt: -1, _id: -1 }, { name: 'article_category_recent' });
module.exports = mongoose.model('Article', schema);
