const mongoose = require('mongoose');
// Serialize account/permission changes so concurrent administrators cannot each
// remove the other's access under snapshot isolation.
const schema = new mongoose.Schema({ _id: { type: String, enum: ['access'] }, revision: { type: Number, required: true, default: 0 } },
  { strict: 'throw', versionKey: false, autoCreate: false, autoIndex: false });
module.exports = mongoose.model('AdministrationState', schema);
