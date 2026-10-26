const hashPattern = /^[a-f0-9]{64}$/;
// A publication flag alone never approves an edition. This is a necessary gate;
// authentic editorial approval must still be supplied through the controlled workflow.
function isEditionApproved(edition) {
  if (!edition || edition.approvalStatus !== 'APPROVED' || !edition.editionId ||
      !hashPattern.test(edition.datasetSha256 || '') || !edition.sourceVersion) return false;
  const manifest = edition.sourceManifest;
  if (!Array.isArray(manifest) || !manifest.some(file => file.role === 'authoritative_manuscript' && hashPattern.test(file.sha256 || '')) ||
      manifest.some(file => !file.path || !file.format || !file.role || !hashPattern.test(file.sha256 || ''))) return false;
  if (edition.validation?.structuralPassed !== true || edition.validation?.textFidelityPassed !== true) return false;
  const approval = edition.approval;
  if (!approval?.approvedBy || !Number.isFinite(Date.parse(approval.approvedAt)) || !hashPattern.test(approval.reviewRecordSha256 || '')) return false;
  const issues = edition.sourceIssues ?? [], decisions = approval.issueDecisions ?? [];
  if (!Array.isArray(issues) || !Array.isArray(decisions) || issues.some(issue => !issue.id) ||
      new Set(issues.map(issue => issue.id)).size !== issues.length || decisions.length !== issues.length ||
      new Set(decisions.map(decision => decision.issueId)).size !== decisions.length) return false;
  return issues.every(issue => decisions.some(decision => decision.issueId === issue.id &&
    ['resolved', 'accepted'].includes(decision.status) && decision.rationale && decision.reviewedBy));
}
module.exports = { isEditionApproved };

