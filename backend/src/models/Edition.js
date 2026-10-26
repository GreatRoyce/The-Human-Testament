const mongoose = require('mongoose');
const { exactString, options } = require('./contentFields');
const { isEditionApproved } = require('../services/contentApproval');
const schema = new mongoose.Schema({
  editionId: exactString({ required: true, unique: true }), sourceVersion: exactString({ required: true }),
  datasetSha256: exactString({ required: true, match: /^[a-f0-9]{64}$/ }),
  approvalStatus: { type: String, enum: ['DRAFT_REVIEW_REQUIRED', 'APPROVED'], default: 'DRAFT_REVIEW_REQUIRED' },
  isPublished: { type: Boolean, default: false }, sourceManifest: { type: [mongoose.Schema.Types.Mixed], default: [] },
  validation: mongoose.Schema.Types.Mixed, approval: mongoose.Schema.Types.Mixed,
  sourceIssues: { type: [mongoose.Schema.Types.Mixed], default: [] }, editorialApparatus: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, options);
schema.pre('validate', function () {
  if (this.isPublished && !isEditionApproved(this)) this.invalidate('approval', 'Published editions require manifest, validation, issue review, and explicit approval.');
});
schema.index({ isPublished: 1 }, { unique: true, partialFilterExpression: { isPublished: true } });
module.exports = mongoose.model('Edition', schema);

