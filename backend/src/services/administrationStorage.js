const mongoose = require('mongoose');
const Grant = require('../models/AnalyticsGrant'), Audit = require('../models/ModerationAction'), State = require('../models/AdministrationState');
const unavailable = () => Object.assign(new Error('Administration storage is unavailable.'), { status: 503 });
async function assertAdministrationStorage() {
  try {
    if (mongoose.connection.readyState !== 1) throw unavailable();
    for (const model of [Grant, Audit]) {
      const actual = await model.collection.indexes();
      if (actual.some(index => index.expireAfterSeconds !== undefined)) throw unavailable();
      for (const [key, options] of model.schema.indexes()) if (!actual.some(index => index.name === options.name && JSON.stringify(index.key) === JSON.stringify(key) &&
        !index.partialFilterExpression && !index.sparse && (!options.unique || index.unique))) throw unavailable();
    }
    if (!await State.exists({ _id: 'access' })) throw unavailable();
  } catch { throw unavailable(); }
}
async function initializeAdministrationStorage() {
  await require('./authStorage').assertAuthStorage();
  for (const model of [Grant, Audit, State]) { await model.createCollection(); await model.createIndexes(); }
  await State.updateOne({ _id: 'access' }, { $setOnInsert: { revision: 0 } }, { upsert: true });
  await assertAdministrationStorage();
}
module.exports = { assertAdministrationStorage, initializeAdministrationStorage, unavailable };
