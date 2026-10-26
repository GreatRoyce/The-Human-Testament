const mongoose = require('mongoose');
const exactString = (options = {}) => ({ type: String, cast: false, ...options });
const editionFields = { editionId: exactString({ required: true }), isPublished: { type: Boolean, default: false },
  sourceVersion: exactString(), source: mongoose.Schema.Types.Mixed };
const options = { timestamps: true, autoCreate: false, autoIndex: false };
const positiveInteger = { type: Number, required: true, min: 1, validate: Number.isSafeInteger };
module.exports = { exactString, editionFields, options, positiveInteger };

