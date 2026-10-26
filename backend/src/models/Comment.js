const mongoose = require('mongoose');
const { options, ref, text } = require('./communityFields');
const schema = new mongoose.Schema({ discussion: ref('Discussion'), author: ref('User'), body: text(5000),
  status: { type: String, enum: ['active', 'hidden', 'deleted'], default: 'active', required: true } }, options);
schema.index({ discussion: 1, status: 1, createdAt: 1, _id: 1 }, { name: 'comment_discussion_order' });
module.exports = mongoose.model('Comment', schema);
