const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const mammoth = require('mammoth');
const { buildDrafts, PROTECTED_FILES, OUTPUT_FILES, INPUT_FILE, VALIDATION_FILE } = require('./parse-clean-manuscript');
const { sha256, readValidationReport } = require('./ingestion/read-validation-report');
const { verifyPdfSupporting } = require('./ingestion/compare-pdf-supporting');
const { run: inspectMaster } = require('./review-source-warnings');
const dataDir = path.join(__dirname, '../data');
const supportingKeys = ['notes', 'crossReferences', 'crossReferenceIndex', 'glossary', 'sections', 'editorialApparatus'];

function matchesDraftArtifact(actual, expected, kind) {
  return isDeepStrictEqual(actual, expected) && actual.approvalStatus === 'DRAFT_REVIEW_REQUIRED' &&
    (kind === 'report' ? actual.importApproved === false : actual.ingestion?.importApproved === false);
}

function compareDraftContent(actual, expected) {
  const checks = [];
  for (const [name, value, wanted] of [
    ['books, chapters, verses and provenance', actual.canonical.books, expected.canonical.books],
    ['unresolved references', actual.canonical.unresolvedReferences, expected.canonical.unresolvedReferences],
    ...supportingKeys.map(key => [key, actual.supporting[key], expected.supporting[key]]),
  ]) {
    try { assert.deepEqual(value, wanted); checks.push({ name, passed: true }); }
    catch { checks.push({ name, passed: false }); }
  }
  return checks;
}

async function run({ writeReport = false } = {}) {
  const names = [...PROTECTED_FILES, ...Object.values(OUTPUT_FILES)];
  const identities = names.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(dataDir, file))) }));
  const read = file => fs.readFileSync(path.join(dataDir, file), 'utf8');
  const actual = Object.fromEntries(Object.entries(OUTPUT_FILES).map(([key, file]) => [key, JSON.parse(read(file))]));
  const sourceManifest = identities.filter(entry => PROTECTED_FILES.includes(entry.file));
  const fresh = buildDrafts({ rawText: read(INPUT_FILE), validationText: read(VALIDATION_FILE),
    sourceVersion: JSON.parse(read('canonical-content.json')).sourceVersion, sourceManifest });
  const checks = compareDraftContent(actual, fresh);
  for (const [kind, artifact] of Object.entries(actual)) {
    checks.push({ name: `${kind} complete artifact, provenance and draft approval`, passed: matchesDraftArtifact(artifact, fresh[kind], kind) });
  }
  const docx = await mammoth.extractRawText({ path: path.join(dataDir, 'The-Human-Testament-Clean-Ingestion-Edition.docx') });
  const nonblank = text => text.split(/\r?\n/).filter(line => line.trim());
  checks.push({ name: 'DOCX to TXT exact nonblank lines', passed: JSON.stringify(nonblank(docx.value)) === JSON.stringify(nonblank(read(INPUT_FILE))),
    comparedLines: nonblank(docx.value).length, extractionMessages: docx.messages });
  const pdfReview = await inspectMaster({ write: false, quiet: true });
  checks.push({ name: 'Master PDF verses and notes, ignoring layout whitespace', passed: true, checks: pdfReview.checks,
    limitations: pdfReview.limitations });
  checks.push(...await verifyPdfSupporting(fs.readFileSync(path.join(dataDir, 'The-Human-Testament--Complete-Manuscript.pdf')), {
    sections: actual.supporting.sections, books: actual.canonical.books, bookRanges: readValidationReport(read(VALIDATION_FILE)).books,
  }));
  checks.push({ name: 'Structural reconciliation', passed: fresh.report.reconciliationPassed, comparisons: fresh.report.comparisons.length });
  const roles = {
    'The-Human-Testament--Complete-Manuscript.pdf': ['PDF', 'authoritative_manuscript', []],
    [INPUT_FILE]: ['TXT', 'working_ingestion_edition', ['The-Human-Testament--Complete-Manuscript.pdf']],
    'The-Human-Testament-Clean-Ingestion-Edition.docx': ['DOCX', 'working_ingestion_edition', ['The-Human-Testament--Complete-Manuscript.pdf']],
    [VALIDATION_FILE]: ['Markdown', 'validation_evidence', ['The-Human-Testament--Complete-Manuscript.pdf', INPUT_FILE]],
    'canonical-content.json': ['JSON', 'unapproved_import_scaffold', []],
    'canonical-content.draft.json': ['JSON', 'unapproved_canonical_draft', [INPUT_FILE, VALIDATION_FILE]],
    'supporting-material.draft.json': ['JSON', 'unapproved_supporting_draft', [INPUT_FILE, VALIDATION_FILE]],
    'ingestion-report.json': ['JSON', 'generated_validation_evidence', [INPUT_FILE, VALIDATION_FILE]],
    'manuscript-extracted-original-pdf.txt': ['TXT', 'historical_extraction_backup', ['The-Human-Testament--Complete-Manuscript.pdf']],
    'manuscript-extracted.txt': ['TXT', 'historical_working_extraction', []],
  };
  const result = { schemaVersion: 1, verifiedAt: new Date().toISOString(), approvalStatus: 'DRAFT_REVIEW_REQUIRED', importApproved: false,
    editionIdentifier: fresh.canonical.sourceVersion, editionIdentifierVerified: false,
    editionIdentifierOrigin: fresh.canonical.sourceVersionOrigin, checks,
    counts: fresh.report.counts, sourceWarnings: fresh.report.sourceIssues.length,
    outstandingDiscrepancies: { sourceIssues: fresh.report.sourceIssues,
      limitations: ['Original PDF comparison removes whitespace; intended dash spacing remains unverified.',
        'PDF character-layer checks cover verses, notes, book titles/subtitles, and preserved front/back sections including glossary and index. They exclude running headers, layout whitespace, and table-of-contents dot leaders; no page-image review or independent second extractor was available.',
        'No approved Human Testament edition or signed editorial acceptance record is present.'] },
    files: identities.map(({ file, sha256: hash }) => ({ path: `data/${file}`, format: roles[file][0], role: roles[file][1], sha256: hash,
      editionIdentifier: fresh.canonical.sourceVersion, derivedFrom: roles[file][2].map(source => `data/${source}`),
      derivationBasis: 'Existing project scripts and validation report; historical extractions have not been independently revalidated.',
      validationReport: `data/${VALIDATION_FILE}`, approvalStatus: 'NOT_APPROVED_FOR_IMPORT' })),
    passed: checks.every(check => check.passed), databaseModified: false };
  for (const entry of identities) assert.equal(sha256(fs.readFileSync(path.join(dataDir, entry.file))), entry.sha256, `Input modified: ${entry.file}`);
  if (writeReport) fs.writeFileSync(path.join(__dirname, '../docs/SOURCE_MANIFEST.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, checks: checks.map(({name,passed}) => ({name,passed})), counts: result.counts,
    warnings: result.sourceWarnings, importApproved: false, dataFilesUnchanged: identities.length, databaseModified: false,
    output: writeReport ? 'docs/SOURCE_MANIFEST.json' : null }, null, 2));
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--report')) { console.error('Only --report is supported.'); process.exitCode = 1; }
  else run({ writeReport: args.includes('--report') }).then(result => { process.exitCode = result.passed ? 0 : 1; })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { run, compareDraftContent, matchesDraftArtifact };
