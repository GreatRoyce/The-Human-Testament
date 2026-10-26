const mongoose = require('mongoose');
const { exactString, editionFields, options, positiveInteger } = require('./contentFields');
const schema = new mongoose.Schema({
  ...editionFields, book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  bookSlug: exactString({ required: true }), number: positiveInteger, title: exactString({ default: '' }),
  referenceCount: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  completeness: { type: String, enum: ['complete', 'source_incomplete', 'excerpt'], default: 'excerpt' },
}, options);
schema.index({ editionId: 1, book: 1, number: 1 }, { unique: true });
module.exports = mongoose.model('Chapter', schema);
