const mongoose = require('mongoose');

// Apply to future private-resource schemas only. Canonical editorial Note and
// other manuscript models deliberately do not use this plugin.
module.exports = function privateOwner(schema, { field = 'owner' } = {}) {
  if (!['owner', 'user'].includes(field)) throw new Error('Invalid private owner field.');
  if (schema.path(field)) throw new Error('Private owner must be defined by the ownership plugin.');
  schema.add({ [field]: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true } });
  schema.index({ [field]: 1, _id: 1 }, { name: 'private_owner_id' });
};
