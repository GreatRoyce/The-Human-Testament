const mongoose = require('mongoose');
const privateOwner = require('./privateOwner');
const { locationFields, validateLocation, positiveInteger } = require('./readingLocation');
const eventIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const schema = new mongoose.Schema({
  ...locationFields({ immutable: true }),
  visitedAt: { type: Date, required: true, immutable: true, default: Date.now },
  eventId: { type: String, cast: false, required: true, immutable: true, match: eventIdPattern },
  revision: { type: Number, cast: false, required: true, immutable: true, validate: positiveInteger },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw', autoCreate: false, autoIndex: false });
schema.plugin(privateOwner, { field: 'user' });
validateLocation(schema);
schema.index({ user: 1, eventId: 1 }, { unique: true, name: 'reading_history_user_event_unique' });
schema.index({ user: 1, visitedAt: -1, _id: -1 }, { name: 'reading_history_user_recent' });
schema.index({ user: 1, bookId: 1, visitedAt: -1, _id: -1 }, { name: 'reading_history_user_book_recent' });
module.exports = mongoose.model('ReadingHistory', schema);
module.exports.eventIdPattern = eventIdPattern;
