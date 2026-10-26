const mongoose = require('mongoose');
const Bookmark = require('../models/Bookmark');
const PrivateNote = require('../models/PrivateNote');
const unavailable = () => Object.assign(new Error('Saved verses and private notes are unavailable.'), { status: 503 });
async function assertPersonalStorage() {
  if (mongoose.connection.readyState !== 1) throw unavailable();
  try {
    const indexes = await Bookmark.collection.indexes();
    const unique = indexes.find(index => index.name === 'bookmark_user_verse_unique');
    if (!unique?.unique || unique.sparse || unique.partialFilterExpression ||
        JSON.stringify(unique.key) !== JSON.stringify({ user: 1, verseId: 1 })) throw unavailable();
    // Check declared lookup indexes as well; initialization is explicit, never a
    // side effect of a request, and missing storage fails closed.
    for (const Model of [Bookmark, PrivateNote]) {
      const actual = Model === Bookmark ? indexes : await Model.collection.indexes();
      for (const [key, options] of Model.schema.indexes()) {
        if (!actual.some(index => index.name === options.name && JSON.stringify(index.key) === JSON.stringify(key))) throw unavailable();
      }
    }
  } catch { throw unavailable(); }
}
async function personalReady(req, res, next) {
  try { await assertPersonalStorage(); next(); } catch (error) { next(error); }
}
module.exports = { assertPersonalStorage, personalReady };
