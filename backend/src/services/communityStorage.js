const mongoose = require('mongoose');
const models = ['Discussion', 'Comment', 'ReadingCircle', 'CircleMembership', 'ContentReport', 'ModerationAction', 'CommunityModerator'].map(name => require('../models/' + name));
const unavailable = () => Object.assign(new Error('Community storage is unavailable.'), { status: 503 });
async function assertCommunityStorage() {
  try {
    if (mongoose.connection.readyState !== 1) throw unavailable();
    for (const Model of models) {
      const actual = await Model.collection.indexes();
      if (actual.some(index => index.expireAfterSeconds !== undefined)) throw unavailable();
      for (const [key, options] of Model.schema.indexes()) {
        // Global chronology is an administration reporting index. Existing
        // target-scoped moderation must keep working before admin:init runs.
        if (Model.modelName === 'ModerationAction' && options.name === 'moderation_recent') continue;
        if (!actual.some(index => index.name === options.name &&
          JSON.stringify(index.key) === JSON.stringify(key) && (!options.unique || (index.unique && !index.sparse && !index.partialFilterExpression)))) throw unavailable();
      }
    }
  } catch { throw unavailable(); }
}
async function initializeCommunityStorage() {
  for (const Model of models) { await Model.createCollection(); await Model.createIndexes(); }
  await assertCommunityStorage();
  await require('./notificationStorage').initializeNotificationStorage();
}
module.exports = { models, assertCommunityStorage, initializeCommunityStorage };
