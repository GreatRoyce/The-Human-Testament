// Versioned review snapshots only. This module never loads database code.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { sha256 } = require('./ingestion/read-validation-report');
const root = path.join(__dirname, '..');
const json = value => JSON.stringify(value, null, 2) + '\n';

function editionId(version) {
  assert.match(version, /^\d+\.\d+\.\d+-rc\.[1-9]\d*$/, 'Use a candidate version such as 0.1.0-rc.1.');
  return `human-testament-${version}`;
}

function safeRelative(file) {
  assert.ok(typeof file === 'string' && file && !file.includes('\\') &&
    file.split('/').every(part => part && part !== '.' && part !== '..') && !file.includes(':'), 'Unsafe snapshot path.');
  return file;
}

function fileInventory(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'Snapshot symlinks are not permitted.');
    const relative = prefix + entry.name;
    if (entry.isDirectory()) return fileInventory(path.join(directory, entry.name), relative + '/');
    assert.ok(entry.isFile(), 'Unexpected snapshot file type.');
    return [relative];
  }).sort();
}

function verifyCandidate(directory, expectedManifestSha256) {
  const manifestBytes = fs.readFileSync(path.join(directory, 'manifest.json'));
  const digest = sha256(manifestBytes);
  assert.equal(fs.readFileSync(path.join(directory, 'manifest.sha256'), 'utf8'), `${digest}  manifest.json\n`, 'Manifest seal mismatch.');
  if (expectedManifestSha256) assert.equal(digest, expectedManifestSha256, 'Candidate differs from the independently recorded manifest hash.');
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.editionId, editionId(manifest.version));
  assert.equal(manifest.kind, 'FROZEN_CANDIDATE');
  assert.equal(manifest.importApproved, false);
  assert.equal(manifest.published, false);
  assert.equal(manifest.approvalStatus, 'CANDIDATE_REVIEW_REQUIRED');
  assert.ok(manifest.validation.passed);
  assert.equal(new Set(manifest.artifacts.map(item => item.path)).size, manifest.artifacts.length);
  for (const artifact of manifest.artifacts) {
    const bytes = fs.readFileSync(path.join(directory, safeRelative(artifact.path)));
    assert.equal(bytes.length, artifact.bytes, `Snapshot size changed: ${artifact.path}`);
    assert.equal(sha256(bytes), artifact.sha256, `Snapshot hash changed: ${artifact.path}`);
  }
  assert.deepEqual(fileInventory(directory), [...manifest.artifacts.map(item => item.path), 'manifest.json', 'manifest.sha256'].sort(), 'Snapshot inventory changed.');
  return { editionId: manifest.editionId, manifestSha256: digest, artifactsVerified: manifest.artifacts.length, importApproved: false };
}

function writeCandidate(directory, metadata, files) {
  assert.ok(!fs.existsSync(directory), 'Candidate already exists. Never overwrite a frozen edition; choose a new version.');
  const artifacts = files.map(file => ({ path: safeRelative(file.path), role: file.role,
    ...(file.originalPath ? { originalPath: file.originalPath } : {}), bytes: file.bytes.length, sha256: sha256(file.bytes) }));
  assert.equal(new Set(artifacts.map(item => item.path)).size, artifacts.length);
  const manifest = { ...metadata, artifacts };
  // Exclusive directory creation and exclusive writes also reject a competing freeze.
  fs.mkdirSync(directory);
  for (const file of files) {
    const destination = path.join(directory, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.bytes, { flag: 'wx' });
  }
  const bytes = Buffer.from(json(manifest));
  fs.writeFileSync(path.join(directory, 'manifest.json'), bytes, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'manifest.sha256'), `${sha256(bytes)}  manifest.json\n`, { flag: 'wx' });
  return verifyCandidate(directory, sha256(bytes));
}

async function freeze(version) {
  const id = editionId(version);
  const directory = path.join(root, 'editions', id);
  assert.ok(!fs.existsSync(directory), 'Candidate already exists. Never overwrite a frozen edition; choose a new version.');
  const read = file => fs.readFileSync(path.join(root, file));
  const decisions = JSON.parse(read('docs/AUTHOR_DECISIONS.json'));
  const sources = decisions.sourceManifest.map(item => ({ path: `data/${item.file}`, sha256: item.sha256, bytes: read(`data/${item.file}`).length }));
  const copies = [
    ['data/canonical-content.draft.json', 'content/canonical-content.candidate.json', 'candidate_canonical_content'],
    ['data/supporting-material.draft.json', 'content/supporting-material.candidate.json', 'candidate_supporting_content'],
    ['data/ingestion-report.json', 'validation/ingestion-report.json', 'ingestion_validation'],
    ['data/The-Human-Testament-Ingestion-Validation-Report.md', 'validation/source-validation-report.md', 'source_validation_report'],
    ['docs/AUTHOR_DECISIONS.json', 'editorial/AUTHOR_DECISIONS.json', 'durable_author_decisions'],
    ['docs/EDITORIAL_REVIEW.json', 'editorial/EDITORIAL_REVIEW.json', 'classified_findings'],
    ['docs/EDITORIAL_REVIEW.md', 'editorial/EDITORIAL_REVIEW.md', 'human_review'],
    ['docs/REPEATED_PASSAGES.md', 'editorial/REPEATED_PASSAGES.md', 'intentional_repetitions'],
    ['docs/SOURCE_WARNING_REVIEW.json', 'editorial/SOURCE_WARNING_REVIEW.json', 'original_pdf_evidence'],
  ];
  const files = copies.map(([originalPath, destination, role]) => ({ path: destination, originalPath, role, bytes: read(originalPath) }));
  const toolPaths = ['package.json', 'package-lock.json', 'scripts/freeze-candidate-edition.js',
    'scripts/parse-clean-manuscript.js', 'scripts/review-source-warnings.js', 'scripts/prepare-editorial-review.js',
    'scripts/verify-content-fidelity.js', ...fs.readdirSync(path.join(root, 'scripts/ingestion')).filter(file => file.endsWith('.js')).map(file => `scripts/ingestion/${file}`),
    'tests/ingestion.test.js', 'tests/editorial-review.test.js', 'tests/fidelity.test.js', 'tests/candidate-edition.test.js'];
  const validationTools = toolPaths.map(file => ({ path: file, sha256: sha256(read(file)) }));
  const checkInputs = () => {
    for (const source of [...sources, ...validationTools]) assert.equal(sha256(read(source.path)), source.sha256, `Freeze input changed: ${source.path}`);
    for (const file of files.filter(file => file.originalPath)) assert.ok(read(file.originalPath).equals(file.bytes), `Freeze evidence changed: ${file.originalPath}`);
  };
  checkInputs();
  assert.equal(require('./parse-clean-manuscript').run({ checkOnly: true }), 0, 'Ingestion validation failed.');
  const fidelity = await require('./verify-content-fidelity').run({ writeReport: false });
  assert.ok(fidelity.passed, 'Fidelity validation failed.');
  const review = await require('./prepare-editorial-review').run({ check: true });
  const testArgs = ['--test', 'tests/ingestion.test.js', 'tests/editorial-review.test.js', 'tests/fidelity.test.js', 'tests/candidate-edition.test.js'];
  const tests = spawnSync(process.execPath, testArgs, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NODE_TEST_REPORTER: 'tap' } });
  if (tests.error) throw tests.error;
  assert.equal(tests.status, 0, `Focused regression tests failed:\n${tests.stdout}\n${tests.stderr}`);
  const tally = label => Number(tests.stdout.match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1]);
  assert.ok(tally('tests') > 0 && tally('tests') === tally('pass') && tally('fail') === 0 && tally('skipped') === 0, 'Incomplete regression results.');
  checkInputs();
  const frozenAt = new Date().toISOString();
  const report = JSON.parse(read('data/ingestion-report.json'));
  const canonical = JSON.parse(read('data/canonical-content.draft.json'));
  const validation = { passed: true, verifiedAt: frozenAt, runtime: { node: process.version, platform: process.platform, arch: process.arch },
    ingestion: { command: 'npm run ingestion:check', status: report.status, reconciliationPassed: report.reconciliationPassed,
      comparisons: report.comparisons.length, errors: report.errors.length, validationReportIssues: report.reportIssues.length,
      sourceWarnings: report.sourceIssues.length },
    fidelity: { command: 'npm run fidelity:check', passed: fidelity.passed, checks: fidelity.checks.length, limitations: fidelity.outstandingDiscrepancies.limitations },
    editorial: { command: 'npm run editorial:check', status: review.status, decisions: review.decisions, classifications: review.counts },
    tests: { command: `node ${testArgs.join(' ')}`, passed: tally('pass'), failed: tally('fail'), skipped: tally('skipped'), evidence: 'validation/regression-tests.tap' },
    databaseModified: false };
  const master = sources.find(item => item.path.endsWith('.pdf'));
  const metadata = { schemaVersion: 1, editionId: id, version, kind: 'FROZEN_CANDIDATE', frozenAt,
    calendarDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(frozenAt)),
    timeZone: 'Africa/Lagos', approvalStatus: 'CANDIDATE_REVIEW_REQUIRED', importApproved: false, published: false,
    identity: { authority: 'manifest.json and its independently recorded SHA-256',
      distinction: 'A versioned snapshot derived from working drafts, not the master PDF or a verified historical edition. Content bytes are unchanged; the manifest assigns candidate identity.',
      inheritedSourceVersion: canonical.sourceVersion, inheritedSourceVersionVerified: false,
      changePolicy: 'Never edit or regenerate this directory. Any content, evidence or decision change requires a new candidate version.' },
    master, sourceFiles: sources.map(source => ({ ...source, role: fidelity.files.find(file => file.path === source.path).role })), validationTools, counts: report.counts, validation,
    editorial: { authorDecisionStatus: review.status, decisions: review.decisions, pendingFindingDecisions: decisions.decisions.filter(item => item.status !== 'accepted').map(item => item.issueId),
      retainedFindings: review.counts,
      retainedUncertainties: ['31 references have no authored text; omissions are not confirmed intentional.',
        '31 probable note anchors remain inferred, with original source marker absence retained.',
        'Inquiry 1:13, Inquiry 4:13 and Relationships 1:16 remain absent targets; their citations are accepted as printed.',
        '24 legacy citation mappings remain unverified, including topical questions for notes 1314 and 1367.',
        '49 dash joins and punctuation observations are accepted for preservation; PDF whitespace and paragraph layout are not certified.'],
      intentionalRepetition: { pairs: review.counts.REPEATED_SOURCE_PASSAGE,
        occurrencesPreserved: review.entries.filter(entry => entry.code === 'REPEATED_SOURCE_PASSAGE').reduce((sum, entry) => sum + entry.passages.length, 0),
        authorConfirmed: review.entries.filter(entry => entry.code === 'REPEATED_SOURCE_PASSAGE').every(entry => entry.intent === 'AUTHOR_CONFIRMED') },
      outstandingEditionDecisions: [{ decision: 'Explicit canonical/import approval of this exact candidate manifest hash', status: 'NOT_GRANTED' }],
      outstandingVerification: ['PDF page-image/meaningful whitespace review and an independent second extraction have not been performed.'] } };
  files.push({ path: 'validation/fidelity-results.json', role: 'fresh_fidelity_results', bytes: Buffer.from(json(fidelity)) },
    { path: 'validation/regression-tests.tap', role: 'executed_regression_results', bytes: Buffer.from(tests.stdout + (tests.stderr ? '\n' + tests.stderr : '')) });
  let readme = `# Human Testament candidate ${version}\n\nEdition ID: **${id}**. Frozen ${frozenAt} (calendar date ${metadata.calendarDate}, Africa/Lagos).\n\n`;
  readme += 'This candidate is a frozen snapshot of the canonical and supporting working drafts plus their review evidence. It is distinct from the master PDF. The payloads retain their exact draft bytes and inherited, unverified sourceVersion; candidate identity comes from manifest.json.\n\n';
  readme += `Validation: ${validation.fidelity.checks} fidelity checks passed; ${validation.ingestion.comparisons} structural comparisons; ${validation.tests.passed} regression tests passed. Ingestion remains ${report.status}, with ${report.sourceIssues.length} warnings. All ${review.decisions.accepted} author decisions are recorded; ${review.decisions.pending} findings await a decision.\n\n`;
  readme += 'No canonical import or publication is approved. The three invalid citations, 31 missing texts, 31 inferred anchors, legacy mapping flags, punctuation observations and 49 spacing uncertainties remain recorded. All 67 intentional repeated pairs are preserved. PDF whitespace/layout and page-image fidelity remain unverified.\n\n';
  readme += '## Files and integrity\n\nContent is in content/, author decisions and findings in editorial/, and executed checks in validation/. All ten original source/draft hashes and their roles are recorded in manifest.json; the master PDF is referenced by hash, not copied or replaced. Source files remain in backend/data/.\n\n';
  readme += 'manifest.sha256 seals manifest.json, whose artifact hashes cover every other snapshot file. This detects drift; it is not a digital signature or operating-system write lock. Retain the manifest hash independently. Do not edit this directory or overwrite this version; create a new version for every change.\n\n';
  readme += `From backend/: \`npm run candidate:check -- --version ${version}\`. To anchor verification externally, append \`--manifest-sha256 <recorded-hash>\`. Checking uses this snapshot only, so later draft edits do not invalidate the frozen candidate.\n\n`;
  readme += '## Original file identities (SHA-256)\n\n| Original path | SHA-256 |\n| --- | --- |\n';
  for (const source of sources) readme += `| ${source.path} | ${source.sha256} |\n`;
  files.push({ path: 'README.md', role: 'candidate_identification', bytes: Buffer.from(readme) });
  checkInputs();
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  const result = writeCandidate(directory, metadata, files);
  checkInputs();
  console.log(json({ ...result, directory: path.relative(root, directory).split(path.sep).join('/'), validation }));
  return result;
}

async function main(args) {
  const check = args.includes('--check');
  const options = {};
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--check') continue;
    assert.ok(['--version', '--manifest-sha256'].includes(args[index]) && args[index + 1] && !options[args[index]], 'Unknown, repeated or incomplete option.');
    options[args[index]] = args[++index];
  }
  const version = options['--version'];
  editionId(version);
  if (options['--manifest-sha256']) assert.match(options['--manifest-sha256'], /^[a-f0-9]{64}$/);
  if (check) console.log(json(verifyCandidate(path.join(root, 'editions', editionId(version)), options['--manifest-sha256'])));
  else { assert.ok(!options['--manifest-sha256'], 'Manifest hash is a check-only option.'); await freeze(version); }
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { editionId, verifyCandidate, writeCandidate };
