const mongoose = require('mongoose');
const schema = new mongoose.Schema({ _id: { type: String, enum: ['collection'] }, startedAt: { type: Date, required: true, immutable: true } },
  { strict: 'throw', versionKey: false, autoCreate: false, autoIndex: false });
module.exports = mongoose.model('AnalyticsState', schema);
