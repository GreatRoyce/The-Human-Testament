const mongoose = require('mongoose');
const { exactString, editionFields, options, positiveInteger } = require('./contentFields');
const schema = new mongoose.Schema({
  ...editionFields, id: exactString({ required: true }), noteNumber: positiveInteger,
  anchor: { type: mongoose.Schema.Types.Mixed, required: true }, raw: exactString({ required: true }),
  targets: { type: [mongoose.Schema.Types.Mixed], required: true }, reviewRequired: Boolean,
}, { ...options, strict: false });
schema.index({ editionId: 1, id: 1 }, { unique: true });
module.exports = mongoose.model('CrossReference', schema);

