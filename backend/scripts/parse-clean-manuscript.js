const fs = require('node:fs');
const path = require('node:path');
const { parseManuscript } = require('./ingestion/parse-manuscript');
const { readValidationReport, sha256 } = require('./ingestion/read-validation-report');
const { validateManuscript } = require('./ingestion/validate-manuscript');

const dataDir = path.join(__dirname, '../data');
const INPUT_FILE = 'The-Human-Testament-Clean-Ingestion-Edition.txt';
const VALIDATION_FILE = 'The-Human-Testament-Ingestion-Validation-Report.md';
const PROTECTED_FILES = [
  INPUT_FILE, VALIDATION_FILE, 'The-Human-Testament--Complete-Manuscript.pdf',
  'The-Human-Testament-Clean-Ingestion-Edition.docx', 'canonical-content.json',
  'manuscript-extracted-original-pdf.txt', 'manuscript-extracted.txt',
];
const OUTPUT_FILES = { canonical: 'canonical-content.draft.json', supporting: 'supporting-material.draft.json', report: 'ingestion-report.json' };

function buildDrafts({ rawText, validationText, sourceVersion = 'UNCONFIRMED', sourceManifest = [] }) {
  const expected = readValidationReport(validationText);
  const parsed = parseManuscript(rawText);
  const validation = validateManuscript(parsed, expected);
  const metadata = {
    schemaVersion: 2, sourceVersion, approvalStatus: 'DRAFT_REVIEW_REQUIRED',
    sourceVersionOrigin: 'Inherited from the existing canonical-content.json scaffold; not a new approval or verified manuscript date.',
    inputFile: INPUT_FILE, inputSha256: sha256(rawText), validationReport: VALIDATION_FILE,
    validationReportSha256: sha256(validationText), sourceManifest,
  };
  const pdf = sourceManifest.find((entry) => entry.file === 'The-Human-Testament--Complete-Manuscript.pdf');
  if (pdf && pdf.sha256 !== expected.originalPdfSha256) {
    validation.errors.push({ category: 'ingestion', code: 'PDF_HASH_MISMATCH', message: 'Original PDF hash does not match the validation report.' });
    validation.status = 'INGESTION_FAILED'; validation.reconciliationPassed = false;
  }
  const ingestion = { status: validation.status, reconciliationPassed: validation.reconciliationPassed, importApproved: false };
  const canonical = { ...metadata, ingestion, books: parsed.books, unresolvedReferences: parsed.unresolvedReferences };
  const supporting = { ...metadata, ingestion, notes: parsed.notes, crossReferences: parsed.crossReferences,
    crossReferenceIndex: parsed.indexEntries, glossary: parsed.glossaryEntries,
    sections: parsed.sections, editorialApparatus: parsed.editorialMarkers };
  const report = {
    ...metadata, ...validation,
    expectedCounts: expected.counts,
    actualBookCount: validation.counts.books, chapterCount: validation.counts.chapters,
    verseReferenceCount: validation.counts.references, storedVerseCount: validation.counts.authoredVerses,
    emptyVerseCount: validation.counts.unresolvedReferences,
    // This counts editorial Note lines, not original manuscript footnote markers.
    noteMarkerCount: parsed.notes.length, originalFootnoteMarkerCount: validation.counts.explicitAnchors,
    inferredAnchorCount: validation.counts.inferredAnchors, extractedNoteCount: validation.counts.notes,
    supportingSectionCount: parsed.sections.filter((section) => section.kind === 'chapter_supporting_material').length,
    invalidCrossReferenceTargetCount: parsed.crossReferences.flatMap((entry) => entry.targets).filter((entry) => !entry.referenceExists).length,
    repeatedPassageGroupCount: validation.repeatedPassages.length,
    legacyBookNameNoteCount: validation.legacyNoteNumbers.length,
    emptyReferenceReconciliation: {
      expected: expected.counts.unresolvedReferences, actual: parsed.unresolvedReferences.length,
      editorialFlagCount: validation.noTextFlagCount,
      matchedByIdentity: validation.comparisons.find((entry) => entry.name === 'empty reference identities')?.passed === true,
      findings: parsed.unresolvedReferences.map((ref) => ({ reference: ref.canonicalId, cleanTextLine: ref.source.line,
        flagLines: ref.editorialFlags.map((flag) => flag.line), ...ref.validationReport })),
      previousThirtyFlagTallyReproduced: validation.noTextFlagCount === 30,
      explanation: `The input contains ${validation.noTextFlagCount} missing-text flags. The reconciliation records their exact reference identities and source lines; no text or marker is invented to match the earlier tally.`,
    },
    referenceInventory: parsed.references,
    validationReportFindings: {
      repeatedPassages: expected.repeatedPassagesText, punctuation: expected.punctuationReview,
      inferredLineJoins: expected.inferredJoins, legacyNotes: expected.legacyNotes,
      independentPdfComparison: expected.independentPdfComparison,
    },
  };
  return { canonical, supporting, report };
}

function run({ checkOnly = false } = {}) {
  const sourceManifest = PROTECTED_FILES.map((file) => ({ file, sha256: sha256(fs.readFileSync(path.join(dataDir, file))) }));
  const scaffold = JSON.parse(fs.readFileSync(path.join(dataDir, 'canonical-content.json'), 'utf8'));
  const drafts = buildDrafts({ rawText: fs.readFileSync(path.join(dataDir, INPUT_FILE), 'utf8'),
    validationText: fs.readFileSync(path.join(dataDir, VALIDATION_FILE), 'utf8'), sourceVersion: scaffold.sourceVersion,
    sourceManifest });
  // Recheck every protected input before writing any working draft.
  for (const entry of sourceManifest) {
    if (sha256(fs.readFileSync(path.join(dataDir, entry.file))) !== entry.sha256) throw new Error(`Source changed while parsing: ${entry.file}`);
  }
  if (!checkOnly) {
    // The only write destinations are these three named, regenerable draft/report files.
    for (const [kind, file] of Object.entries(OUTPUT_FILES)) fs.writeFileSync(path.join(dataDir, file), JSON.stringify(drafts[kind], null, 2) + '\n', 'utf8');
  }
  const { report } = drafts;
  console.log(JSON.stringify({ checkOnly, status: report.status, reconciliationPassed: report.reconciliationPassed,
    importApproved: report.importApproved, counts: report.counts,
    warnings: report.warnings.length, sourceIssues: report.sourceIssues.length, validationReportIssues: report.reportIssues.length, ingestionErrors: report.errors.length,
    invalidCrossReferenceTargets: report.invalidCrossReferenceTargetCount,
    repeatedPassageGroups: report.repeatedPassageGroupCount, legacyBookNameNotes: report.legacyBookNameNoteCount,
    classifiedNonBlankLines: report.lineAccounting.classifiedCount,
    protectedFilesUnchanged: sourceManifest.length, databaseModified: false,
    outputs: checkOnly ? [] : Object.values(OUTPUT_FILES) }, null, 2));
  if (report.errors.length) console.error(JSON.stringify(report.errors, null, 2));
  return report.errors.length ? 1 : 0;
}

if (require.main === module) {
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--check');
  if (unknown.length) { console.error(`Unknown parser option: ${unknown.join(', ')}`); process.exitCode = 1; }
  else try { process.exitCode = run({ checkOnly: process.argv.includes('--check') }); }
  catch (error) { console.error(`Parser failed: ${error.message}`); process.exitCode = 1; }
}

module.exports = { buildDrafts, run, INPUT_FILE, VALIDATION_FILE, PROTECTED_FILES, OUTPUT_FILES };
