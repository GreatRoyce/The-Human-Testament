const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { editionId, writeCandidate, verifyCandidate } = require('../scripts/freeze-candidate-edition');

function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'human-testament-candidate-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(parent)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(parent).startsWith('human-testament-candidate-test-'));
    fs.rmSync(parent, { recursive: true, force: true });
  });
  const directory = path.join(parent, editionId('0.0.0-rc.1'));
  const metadata = { editionId: editionId('0.0.0-rc.1'), version: '0.0.0-rc.1', kind: 'FROZEN_CANDIDATE',
    approvalStatus: 'CANDIDATE_REVIEW_REQUIRED', importApproved: false, published: false, validation: { passed: true } };
  const files = [{ path: 'content/example.json', role: 'synthetic_fixture_only', bytes: Buffer.from('{"text":"Preserve punctuation.  And spaces."}\n') }];
  return { directory, metadata, files };
}

test('candidate freezes exact bytes, verifies independently of mutable sources, and refuses to overwrite an existing version', t => {
  const value = fixture(t);
  const result = writeCandidate(value.directory, value.metadata, value.files);
  const before = fs.readFileSync(path.join(value.directory, 'manifest.json'));
  assert.deepEqual(fs.readFileSync(path.join(value.directory, value.files[0].path)), value.files[0].bytes);
  assert.deepEqual(verifyCandidate(value.directory, result.manifestSha256), result);
  assert.throws(() => writeCandidate(value.directory, value.metadata, value.files), /Never overwrite/);
  assert.deepEqual(fs.readFileSync(path.join(value.directory, 'manifest.json')), before);
  assert.equal(result.importApproved, false);
});

test('candidate verification detects edited, missing and unexpected artifacts plus changed manifest seals', t => {
  const value = fixture(t);
  writeCandidate(value.directory, value.metadata, value.files);
  const contentPath = path.join(value.directory, value.files[0].path);
  fs.appendFileSync(contentPath, ' ');
  assert.throws(() => verifyCandidate(value.directory), /size changed/);
  fs.writeFileSync(contentPath, Buffer.from(value.files[0].bytes.toString().replace('spaces', 'SPACES')));
  assert.throws(() => verifyCandidate(value.directory), /hash changed/);
  fs.unlinkSync(contentPath);
  assert.throws(() => verifyCandidate(value.directory));
  fs.writeFileSync(contentPath, value.files[0].bytes);
  fs.writeFileSync(path.join(value.directory, 'unexpected.txt'), 'unapproved extra');
  assert.throws(() => verifyCandidate(value.directory), /inventory changed/);
  fs.unlinkSync(path.join(value.directory, 'unexpected.txt'));
  fs.appendFileSync(path.join(value.directory, 'manifest.json'), '\n');
  assert.throws(() => verifyCandidate(value.directory), /seal mismatch/);
});

test('external manifest identity rejects a resealed change; candidate versions and snapshot paths cannot escape their directories', t => {
  const value = fixture(t);
  const result = writeCandidate(value.directory, value.metadata, value.files);
  assert.throws(() => verifyCandidate(value.directory, '0'.repeat(64)), /independently recorded/);
  const changedManifest = JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(value.directory, 'manifest.json'))), changed: true }) + '\n';
  fs.writeFileSync(path.join(value.directory, 'manifest.json'), changedManifest);
  const changedHash = createHash('sha256').update(changedManifest).digest('hex');
  fs.writeFileSync(path.join(value.directory, 'manifest.sha256'), `${changedHash}  manifest.json\n`);
  assert.equal(verifyCandidate(value.directory).manifestSha256, changedHash);
  assert.throws(() => verifyCandidate(value.directory, result.manifestSha256), /independently recorded/);
  for (const version of ['../master', '1.0.0', '2024-07-09', '0.1.0-rc.0']) assert.throws(() => editionId(version));
  const other = path.join(path.dirname(value.directory), 'unsafe');
  for (const file of ['../master.pdf', '/absolute', 'C:/absolute', 'content\\escape']) {
    assert.throws(() => writeCandidate(other, value.metadata, [{ ...value.files[0], path: file }]), /Unsafe/);
    assert.equal(fs.existsSync(other), false);
  }
  assert.equal(verifyCandidate(value.directory).importApproved, false);
});
