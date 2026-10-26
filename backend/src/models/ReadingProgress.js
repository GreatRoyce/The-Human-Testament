const mongoose = require('mongoose');
const privateOwner = require('./privateOwner');
const { locationFields, validateLocation, positiveInteger } = require('./readingLocation');
const schema = new mongoose.Schema({
  ...locationFields(),
  lastReadAt: { type: Date, required: true, default: Date.now },
  revision: { type: Number, cast: false, required: true, validate: positiveInteger },
}, { timestamps: true, strict: 'throw', autoCreate: false, autoIndex: false });
schema.plugin(privateOwner, { field: 'user' });
validateLocation(schema);
schema.index({ user: 1, bookId: 1 }, { unique: true, name: 'reading_progress_user_book_unique' });
schema.index({ user: 1, lastReadAt: -1, _id: -1 }, { name: 'reading_progress_user_recent' });
module.exports = mongoose.model('ReadingProgress', schema);
