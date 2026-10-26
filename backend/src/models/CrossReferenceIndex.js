const mongoose = require('mongoose');
const { exactString, editionFields, options } = require('./contentFields');
const schema = new mongoose.Schema({
  ...editionFields, id: exactString({ required: true }), rawSource: exactString({ required: true }), raw: exactString({ required: true }),
  anchor: mongoose.Schema.Types.Mixed, targets: [mongoose.Schema.Types.Mixed], matchedNoteNumber: Number, reviewRequired: Boolean, sourceLines: [Number],
}, { ...options, strict: false });
schema.index({ editionId: 1, id: 1 }, { unique: true });
module.exports = mongoose.model('CrossReferenceIndex', schema);

