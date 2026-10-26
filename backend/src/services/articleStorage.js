const mongoose = require('mongoose');
const models = [require('../models/Article'), require('../models/ArticlePublication')];
const unavailable = () => Object.assign(new Error('Article storage is unavailable.'), { status: 503 });
async function assertArticleStorage() {
  try {
    if (mongoose.connection.readyState !== 1) throw unavailable();
    for (const Model of models) {
      const actual = await Model.collection.indexes();
      if (actual.some(index => index.expireAfterSeconds !== undefined)) throw unavailable();
      for (const [key, options] of Model.schema.indexes()) if (!actual.some(index => index.name === options.name && JSON.stringify(index.key) === JSON.stringify(key) &&
        (!options.unique || (index.unique && !index.sparse && !index.partialFilterExpression)))) throw unavailable();
    }
  } catch { throw unavailable(); }
}
async function initializeArticleStorage() { for (const Model of models) { await Model.createCollection(); await Model.createIndexes(); } await assertArticleStorage(); }
module.exports = { assertArticleStorage, initializeArticleStorage };
