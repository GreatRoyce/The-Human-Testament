const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildReview, pendingDecisions, validateDecisions, renderReview, renderRepetitions } = require('../scripts/prepare-editorial-review');
const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
const evidence = read('docs/SOURCE_WARNING_REVIEW.json');
const canonical = read('data/canonical-content.draft.json');
const supporting = read('data/supporting-material.draft.json');
const build = decisions => buildReview({ evidence, canonical, supporting, decisions });

test('editorial review classifies every original finding without converting evidence, suggestions or source repetitions into approval', () => {
  const decisions = pendingDecisions(evidence), result = build(decisions);
  assert.deepEqual(result.entries.map(entry => entry.issueId), evidence.entries.map(entry => entry.id));
  assert.equal(result.decisions.pending, evidence.entries.length);
  assert.equal(result.importApproved, false);
  for (const entry of result.entries) {
    assert.ok(entry.classification && entry.authorQuestion);
    assert.equal(entry.contentChanged, false);
    if (entry.code === 'REPEATED_SOURCE_PASSAGE') {
      assert.equal(entry.intent, 'NOT_ESTABLISHED');
      assert.deepEqual(entry.passages.map(passage => passage.text), entry.passages.map(() => entry.passages[0].text));
    }
    if (entry.candidates) for (const candidate of entry.candidates) assert.equal(candidate.intendedTargetEstablished, false);
    if (entry.parallelPassage) assert.equal(entry.parallelPassage.useApproved, false);
  }
  assert.equal(result.entries.find(entry => entry.note?.noteNumber === 404 && entry.code === 'LEGACY_BOOK_NAME').anchorVerse.status, 'missing_source_text');
  const markdown = renderReview(result), repeats = renderRepetitions(result);
  for (const entry of result.entries) assert.ok(markdown.includes(entry.issueId), entry.issueId);
  for (const entry of result.entries.filter(entry => entry.code === 'REPEATED_SOURCE_PASSAGE')) assert.ok(repeats.includes(entry.issueId), entry.issueId);
});

test('author decisions cannot be lost, rebound to different source/finding hashes, or accepted without identity and a recorded response', () => {
  const original = pendingDecisions(evidence);
  for (const change of [value => value.decisions.pop(), value => value.decisions.push(value.decisions[0]),
    value => { value.sourceManifest[0].sha256 = '0'.repeat(64); },
    value => { value.decisions[0].issueSha256 = '0'.repeat(64); },
    value => { value.decisions[0].status = 'accepted'; }, value => { value.importApproved = true; }]) {
    const candidate = structuredClone(original); change(candidate);
    assert.throws(() => validateDecisions(evidence, candidate));
  }
  const candidate = structuredClone(original);
  candidate.authorIdentity.role = 'author';
  Object.assign(candidate.decisions[0], { status: 'deferred', action: 'retain_unresolved', rationale: 'Synthetic test response only.',
    reviewer: 'test-author', decidedAt: '2026-10-11T00:00:00Z', authorResponse: 'Defer this finding; do not change its text.' });
  validateDecisions(evidence, candidate);
  assert.equal(build(candidate).decisions.deferred, 1);
  assert.equal(build(candidate).importApproved, false);
});

test('missing wording and inferred anchors remain separate decisions; preservation acceptance alone never proves intentional repetition', () => {
  const decisions = pendingDecisions(evidence);
  decisions.authorIdentity.role = 'author';
  const repeat = decisions.decisions.find(entry => entry.code === 'REPEATED_SOURCE_PASSAGE');
  Object.assign(repeat, { status: 'accepted', action: 'preserve_as_printed', rationale: 'Synthetic test response only.', reviewer: 'test-author',
    decidedAt: '2026-10-11T00:00:00Z', authorResponse: 'Accept the printed text, without certifying intended repetition.' });
  let result = build(decisions);
  assert.equal(result.entries.find(entry => entry.issueId === repeat.issueId).intent, 'NOT_ESTABLISHED');
  repeat.action = 'preserve_intentional_repetition'; repeat.authorResponse = 'This test fixture repetition is intentional.';
  result = build(decisions);
  assert.equal(result.entries.find(entry => entry.issueId === repeat.issueId).intent, 'AUTHOR_CONFIRMED');
  for (const entry of result.entries.filter(entry => entry.code === 'MISSING_SOURCE_TEXT')) {
    assert.equal(entry.relatedIssueIds.length, 1);
    assert.equal(result.entries.find(other => other.issueId === entry.relatedIssueIds[0]).decision.status, 'pending');
  }
  assert.equal(result.importApproved, false);
});

test('author acceptance of printed broken citations preserves missing-target flags and never selects a thematic replacement', () => {
  const decisions = pendingDecisions(evidence);
  decisions.authorIdentity.role = 'author';
  const before = build(decisions).entries.filter(entry => entry.code === 'INVALID_CROSS_REFERENCE_TARGET');
  const contentBefore = JSON.stringify({ canonical, supporting });
  for (const decision of decisions.decisions.filter(entry => entry.code === 'INVALID_CROSS_REFERENCE_TARGET')) {
    Object.assign(decision, { status: 'accepted', action: 'preserve_broken_citation_as_printed',
      rationale: 'Synthetic test response accepting preservation only.', reviewer: 'test-author',
      decidedAt: '2026-10-11T00:00:00Z', authorResponse: 'Accept as printed and keep invalid flags.' });
  }
  const review = build(decisions);
  const after = review.entries.filter(entry => entry.code === 'INVALID_CROSS_REFERENCE_TARGET');
  assert.equal(after.length, 3);
  for (let index = 0; index < after.length; index++) {
    assert.equal(after[index].decision.status, 'accepted');
    assert.deepEqual(after[index].currentTargets, before[index].currentTargets);
    assert.ok(after[index].currentTargets.some(target => target.status === 'missing_reference'));
    assert.deepEqual(after[index].sourceFinding, before[index].sourceFinding);
    assert.ok(after[index].candidates.every(candidate => candidate.intendedTargetEstablished === false));
  }
  assert.equal(JSON.stringify({ canonical, supporting }), contentBefore);
  assert.equal(review.importApproved, false);
  assert.ok(renderReview(review).includes('Accept as printed and keep invalid flags.'));
});

test('all findings may be reviewed without resolving source uncertainty or approving canonical imports', () => {
  const decisions = pendingDecisions(evidence);
  decisions.authorIdentity.role = 'author';
  assert.equal(build(decisions).status, 'AUTHOR_REVIEW_OPEN');
  for (const decision of decisions.decisions) Object.assign(decision, {
    status: 'accepted', action: 'preserve_with_uncertainty', rationale: 'Synthetic test acceptance of preservation only.',
    reviewer: 'test-author', decidedAt: '2026-10-11T00:00:00Z', authorResponse: 'Preserve every finding and its uncertainty.'
  });
  const review = build(decisions);
  assert.equal(review.status, 'AUTHOR_FINDINGS_REVIEWED');
  assert.equal(review.decisions.accepted, 206);
  assert.equal(review.decisions.pending, 0);
  assert.equal(review.importApproved, false);
  assert.equal(review.counts.MISSING_SOURCE_TEXT, 31);
  assert.equal(review.counts.INFERRED_NOTE_ANCHOR, 31);
  assert.equal(review.counts.INVALID_CROSS_REFERENCE_TARGET, 3);
  assert.deepEqual(review.entries.map(entry => entry.sourceFinding), evidence.entries.map(entry => entry.finding));
  assert.ok(review.entries.filter(entry => entry.code === 'INFERRED_SOURCE_LINE_JOIN').every(entry => entry.spacingEstablished === false));
  assert.ok(review.entries.filter(entry => entry.code === 'REPEATED_SOURCE_PASSAGE').every(entry => entry.intent === 'NOT_ESTABLISHED'));
});
