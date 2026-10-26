const mongoose = require('mongoose');
const ReadingProgress = require('../models/ReadingProgress');
const ReadingHistory = require('../models/ReadingHistory');
const unavailable = () => Object.assign(new Error('Reading progress and history are unavailable.'), { status: 503 });
async function assertReadingStorage() {
  if (mongoose.connection.readyState !== 1) throw unavailable();
  try {
    for (const Model of [ReadingProgress, ReadingHistory]) {
      const actual = await Model.collection.indexes();
      for (const [key, options] of Model.schema.indexes()) {
        if (!actual.some(index => index.name === options.name && JSON.stringify(index.key) === JSON.stringify(key) &&
            (!options.unique || (index.unique && !index.sparse && !index.partialFilterExpression)))) throw unavailable();
      }
      // No retention or automatic deletion policy is enabled for user history.
      if (actual.some(index => index.expireAfterSeconds !== undefined)) throw unavailable();
    }
  } catch { throw unavailable(); }
}
async function readingReady(req, res, next) {
  try { await assertReadingStorage(); next(); } catch (error) { next(error); }
}
module.exports = { assertReadingStorage, readingReady, unavailable };
