const mongoose = require('mongoose');
const Event = require('../models/AnalyticsEvent'), Grant = require('../models/AnalyticsGrant'), State = require('../models/AnalyticsState');
const { unavailable } = require('../config/analytics');
async function checkIndexes(model) {
  const actual = await model.collection.indexes();
  if (actual.some(index => index.expireAfterSeconds !== undefined && (model !== Event || index.name !== 'analytics_expiry'))) throw unavailable();
  for (const [key, options] of model.schema.indexes()) if (!actual.some(index => index.name === options.name && JSON.stringify(index.key) === JSON.stringify(key) &&
    !index.sparse && !index.partialFilterExpression && (!options.unique || index.unique) && index.expireAfterSeconds === options.expireAfterSeconds)) throw unavailable();
}
// Operator-managed role provisioning can operate without traffic collection.
async function assertAnalyticsGrantStorage() {
  try { if (mongoose.connection.readyState !== 1) throw unavailable(); await checkIndexes(Grant); }
  catch { throw unavailable(); }
}
async function assertAnalyticsStorage() {
  try {
    if (mongoose.connection.readyState !== 1) throw unavailable();
    for (const model of [Event, Grant]) await checkIndexes(model);
    if (!await State.exists({ _id: 'collection' })) throw unavailable();
  } catch { throw unavailable(); }
}
async function initializeAnalyticsStorage() {
  for (const model of [Event, Grant, State]) { await model.createCollection(); await model.createIndexes(); }
  await State.updateOne({ _id: 'collection' }, { $setOnInsert: { startedAt: new Date() } }, { upsert: true });
  await assertAnalyticsStorage();
}
module.exports = { initializeAnalyticsStorage, assertAnalyticsStorage, assertAnalyticsGrantStorage };
