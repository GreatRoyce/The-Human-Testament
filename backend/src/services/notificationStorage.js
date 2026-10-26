const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const unavailable = () => Object.assign(new Error('Notifications are unavailable.'), { status: 503 });
async function assertNotificationStorage() {
  try {
    if (mongoose.connection.readyState !== 1) throw unavailable();
    const actual = await Notification.collection.indexes();
    if (actual.some(index => index.expireAfterSeconds !== undefined)) throw unavailable();
    for (const [key, options] of Notification.schema.indexes()) if (!actual.some(index => index.name === options.name && JSON.stringify(index.key) === JSON.stringify(key) &&
      (!options.unique || (index.unique && !index.sparse && !index.partialFilterExpression)))) throw unavailable();
  } catch { throw unavailable(); }
}
async function initializeNotificationStorage() { await Notification.createCollection(); await Notification.createIndexes(); await assertNotificationStorage(); }
module.exports = { assertNotificationStorage, initializeNotificationStorage };
