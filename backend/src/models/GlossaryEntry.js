const mongoose = require('mongoose');
const { exactString, editionFields, options } = require('./contentFields');
const schema = new mongoose.Schema({
  ...editionFields, term: exactString({ required: true }), definition: exactString({ required: true }),
  bookTag: exactString({ required: true }), bookSlug: exactString({ required: true }), sourceLines: [Number],
}, { ...options, strict: false });
schema.index({ editionId: 1, term: 1 }, { unique: true });
module.exports = mongoose.model('GlossaryEntry', schema);

