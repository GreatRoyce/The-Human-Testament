const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { sha256 } = require('../scripts/ingestion/read-validation-report');

test('Git preserves hashed manuscript bytes with Linux and Windows checkout defaults', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'htt-git-byte-integrity-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(parent)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(parent).startsWith('htt-git-byte-integrity-'));
    fs.rmSync(parent, { recursive: true, force: true });
  });
  const repo = path.join(parent, 'repo');
  fs.mkdirSync(repo);
  const attributes = fs.readFileSync(path.join(__dirname, '../../.gitattributes'));
  fs.writeFileSync(path.join(repo, '.gitattributes'), attributes);
  const fixtures = {
    'backend/data/canonical-content.json': fs.readFileSync(path.join(__dirname, '../data/canonical-content.json')),
    'backend/data/transcription.txt': Buffer.from('Authored text.\nSecond line.\n'),
    'backend/data/source.pdf': Buffer.from([37, 80, 68, 70, 10, 0, 13, 10]),
    'backend/docs/evidence.json': Buffer.from('{"reviewRequired":true}\n'),
    'backend/editions/frozen/manifest.json': Buffer.from('{"published":false}\n'),
    'docs/verification.json': Buffer.from('{"passed":true}\n'),
    'shared/manuscript.json': Buffer.from('{"text":"Keep punctuation."}\n'),
  };
  for (const [file, bytes] of Object.entries(fixtures)) {
    const destination = path.join(repo, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  }
  function git(...args) {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  }
  git('init', '--quiet');
  git('-c', 'core.autocrlf=true', 'add', '.');
  for (const mode of ['false', 'true']) {
    const checkout = path.join(parent, `checkout-${mode}`);
    fs.mkdirSync(checkout);
    // Explicit attributes must override the platform's checkout defaults.
    git('-c', `core.autocrlf=${mode}`, 'checkout-index', '--all', `--prefix=${checkout.replace(/\\/g, '/')}/`);
    for (const [file, bytes] of Object.entries(fixtures)) {
      assert.equal(sha256(fs.readFileSync(path.join(checkout, file))), sha256(bytes), `${file}, autocrlf=${mode}`);
    }
  }
});
