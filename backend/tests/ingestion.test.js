const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseManuscript, idFor } = require('../scripts/ingestion/parse-manuscript');
const { parseTargets } = require('../scripts/ingestion/validate-manuscript');
const { readValidationReport, sha256 } = require('../scripts/ingestion/read-validation-report');
const { buildDrafts, INPUT_FILE, VALIDATION_FILE, PROTECTED_FILES } = require('../scripts/parse-clean-manuscript');

const dataDir = path.join(__dirname, '../data');
const rawText = fs.readFileSync(path.join(dataDir, INPUT_FILE), 'utf8');
const validationText = fs.readFileSync(path.join(dataDir, VALIDATION_FILE), 'utf8');
const expected = readValidationReport(validationText);
const makeDrafts = (input = rawText) => buildDrafts({ rawText: input, validationText });
const { canonical, supporting, report } = makeDrafts();
const allVerses = canonical.books.flatMap((book) => book.chapters.flatMap((chapter) => chapter.verses.map((verse) => ({ ...verse, bookSlug: book.slug, chapter: chapter.number, verse: verse.number }))));
const miniature = (body) => `[[CANONICAL BOOKS BEGIN]]\nINQUIRY\nOriginal subtitle\nCHAPTER 1\n${body}\n[[CANONICAL BOOKS END]]`;

test('reconciles the full manuscript against the Markdown report while retaining review status', () => {
  assert.deepEqual(report.counts, { books: 10, chapters: 230, references: 3905, authoredVerses: 3874,
    unresolvedReferences: 31, notes: 1470, explicitAnchors: 1439, inferredAnchors: 31,
    noteCrossReferences: 72, indexEntries: 72, glossaryEntries: 38 });
  assert.equal(report.reconciliationPassed, true);
  assert.equal(report.status, 'REVIEW_REQUIRED');
  assert.equal(report.importApproved, false);
  assert.equal(report.databaseModified, false);
  assert.deepEqual(report.errors, []);
  assert.equal(report.sourceIssues.length, 206);
  assert.equal(report.reportIssues.length, 0);
  assert.equal(report.warnings.length, 206);
  assert.ok(report.warnings.every((warning) => ['source', 'validation_report'].includes(warning.category) && warning.reviewRequired));
  assert.ok(report.comparisons.every((comparison) => comparison.passed));
  assert.equal(report.validationReportFindings.independentPdfComparison.reportedWordTokens, 92156);
  assert.equal(report.validationReportFindings.independentPdfComparison.verifiedByThisParser, false);
});

test('all 31 empty references and flags reconcile by identity; Purpose 3:16 is not a fake verse', () => {
  assert.deepEqual(canonical.unresolvedReferences.map(idFor).sort(), expected.emptyReferences.map(idFor).sort());
  assert.equal(report.emptyReferenceReconciliation.editorialFlagCount, 31);
  assert.equal(report.emptyReferenceReconciliation.previousThirtyFlagTallyReproduced, false);
  const purpose = canonical.unresolvedReferences.find((ref) => ref.canonicalId === 'purpose:3:16');
  assert.equal(purpose.source.line, 11778);
  assert.equal(purpose.editorialFlags[0].line, 11779);
  assert.equal(purpose.validationReport.sourcePage, 542);
  assert.equal(purpose.validationReport.probableNoteNumber, 1467);
  assert.ok(!allVerses.some((verse) => idFor(verse) === 'purpose:3:16'));
  assert.ok(canonical.unresolvedReferences.every((ref) => ref.reviewRequired && !('text' in ref)));
});

test('every authored verse exactly matches its original clean TXT lines, including punctuation and repetition', () => {
  const lines = rawText.split(/\r?\n/);
  for (const verse of allVerses) {
    assert.equal(verse.text, verse.source.textLines.map((line) => lines[line - 1]).join('\n'));
    assert.ok(!verse.text.includes('[['), `Editorial apparatus in ${idFor(verse)}`);
    assert.equal(verse.source.textLines.length, 1);
  }
  assert.ok(allVerses.find((verse) => idFor(verse) === 'inquiry:31:6').text.includes('?;'));
  assert.ok(allVerses.find((verse) => idFor(verse) === 'inquiry:32:3').text.includes('.".'));
  assert.equal(report.repeatedPassageGroupCount, 67);
  assert.ok(report.repeatedPassages.every((group) => group.references.length === 2 && group.reviewRequired));
  for (const group of report.repeatedPassages) for (const reference of group.references) {
    assert.equal(allVerses.find((verse) => idFor(verse) === reference).text, group.text);
  }
});

test('all notes preserve their original marker, prose, citation lines and anchor uncertainty', () => {
  const lines = rawText.split(/\r?\n/);
  for (const note of supporting.notes) {
    assert.equal(note.markerText, lines[note.source.line - 1]);
    assert.equal(note.text, lines[note.source.line]);
    const citations = supporting.crossReferences.filter((ref) => ref.noteNumber === note.noteNumber);
    assert.equal(note.rawText, [note.text, ...citations.map((ref) => ref.raw)].join('\n'));
    assert.equal(note.anchor.referenceExists, true);
    assert.equal(note.anchor.sourceMarkerPresent, note.anchor.status === 'explicit');
    assert.equal(note.anchor.reviewRequired, note.inferredAnchor);
    assert.equal(note.reviewRequired, note.reviewReasons.length > 0);
  }
  const inferred = supporting.notes.filter((note) => note.inferredAnchor);
  assert.equal(inferred.length, 31);
  assert.ok(inferred.every((note) => note.anchor.reviewRequired && !note.anchor.authoredTextExists));
  assert.deepEqual(inferred.filter((note) => note.anchor.indexCorroborated).map((note) => note.noteNumber).sort((a, b) => a - b), [404, 431, 472]);
  assert.ok(inferred.filter((note) => note.anchor.indexCorroborated).every((note) => note.anchor.status === 'inferred'));
});

test('cross-references and all index entries agree while the three invalid targets stay invalid', () => {
  const invalid = supporting.crossReferences.filter((ref) => ref.reviewRequired);
  assert.deepEqual(invalid.map((ref) => ref.noteNumber), [104, 490, 1191]);
  assert.deepEqual(invalid.flatMap((ref) => ref.targets.filter((target) => !target.referenceExists).map(idFor)), ['inquiry:1:13', 'inquiry:4:13', 'relationships:1:16']);
  assert.equal(supporting.crossReferenceIndex.filter((entry) => entry.reviewRequired).length, 3);
  assert.ok(supporting.crossReferenceIndex.every((entry) => Number.isInteger(entry.matchedNoteNumber)));
  assert.ok(supporting.crossReferences.some((ref) => ref.targets.length > 1));
  const refs = new Map(report.referenceInventory.map((ref) => [ref.canonicalId, ref]));
  const parsed = parseTargets('See also: 1:6; Inquiry 12:2', 'inquiry', refs);
  assert.deepEqual(parsed.map(idFor), ['inquiry:1:6', 'inquiry:12:2']);
  assert.equal(parseTargets('See also: nonsense', 'inquiry', refs)[0].status, 'invalid_format');
});

test('glossary and front/back matter retain source text outside canonical verses', () => {
  const lines = rawText.split(/\r?\n/);
  assert.equal(supporting.glossary.length, 38);
  for (const entry of supporting.glossary) {
    assert.deepEqual([entry.term, entry.definition, entry.bookTag], entry.sourceLines.map((line) => lines[line - 1]));
  }
  assert.equal(supporting.sections.filter((section) => section.kind === 'chapter_supporting_material').length, 230);
  assert.ok(supporting.sections.some((section) => section.marker?.includes('CLOSING TEXT')));
  assert.ok(supporting.sections.some((section) => section.marker?.includes('TABLE OF CONTENTS')));
  assert.equal(report.lineAccounting.nonBlankCount, 11618);
  assert.equal(report.lineAccounting.classifiedCount, 11618);
  assert.deepEqual(report.lineAccounting.unclassifiedLines, []);
});

test('only actual old-title citations count as legacy notes; ordinary Responsibility prose is preserved', () => {
  assert.equal(report.legacyBookNameNoteCount, 24);
  assert.ok(!report.legacyNoteNumbers.includes(81));
  assert.ok(supporting.notes.find((note) => note.noteNumber === 81).text.startsWith('Definition. Responsibility is framed'));
  assert.ok(supporting.notes.find((note) => note.noteNumber === 1314).text.includes('Responsibility 8:25'));
  assert.equal(report.sourceIssues.filter((issue) => issue.code === 'INFERRED_SOURCE_LINE_JOIN').length, 49);
  assert.equal(supporting.notes.find((note) => note.noteNumber === 1314).reviewRequired, true);
  assert.equal(supporting.notes.find((note) => note.noteNumber === 1314).anchor.status, 'explicit');
});

test('Relationships chapter 1 stays at 14 authored references; a report contradiction remains detectable', () => {
  const chapter = canonical.books.find((book) => book.slug === 'relationships').chapters.find((entry) => entry.number === 1);
  assert.equal(chapter.referenceCount, 14);
  assert.deepEqual(chapter.verses.map((verse) => verse.number), Array.from({ length: 14 }, (_, index) => index + 1));
  assert.ok(!canonical.unresolvedReferences.some((ref) => ref.bookSlug === 'relationships' && ref.chapter === 1));
  assert.ok(validationText.includes('Relationships chapter 1 has only 14 verses'));
  const inconsistentText = validationText.replace('Relationships chapter 1 has only 14 verses', 'Relationships chapter 1 has only 15 verses');
  const inconsistent = buildDrafts({ rawText, validationText: inconsistentText });
  assert.equal(inconsistent.report.reportIssues.length, 1);
  assert.equal(inconsistent.report.reportIssues[0].code, 'REPORT_INTERNAL_INCONSISTENCY');
  assert.equal(inconsistent.report.reportIssues[0].detail.chapterTableCount, 14);
  assert.equal(inconsistent.report.status, 'REVIEW_REQUIRED');
  assert.equal(inconsistent.report.importApproved, false);
  assert.deepEqual(inconsistent.report.errors, []);
  assert.deepEqual(inconsistent.canonical.books, canonical.books);
});

test('editorial flags and other bracketed markers cannot become canonical verse text', () => {
  const parsed = parseManuscript(miniature('1:1\n[[FLAG: NO VERSE TEXT IN SOURCE — review]]\n1:2\nKeep ?; and “quotes” exactly.\n[[UNKNOWN EDITORIAL MARKER]]'));
  assert.equal(parsed.unresolvedReferences.length, 1);
  assert.deepEqual(parsed.books[0].chapters[0].verses.map((verse) => verse.text), ['Keep ?; and “quotes” exactly.']);
  assert.ok(parsed.errors.some((error) => error.code === 'UNKNOWN_EDITORIAL_MARKER'));
  const conflict = parseManuscript(miniature('1:1\n[[FLAG: NO VERSE TEXT IN SOURCE — review]]\nUnexpected authored text.'));
  assert.ok(conflict.errors.some((error) => error.code === 'FLAG_TEXT_CONFLICT'));
});

test('an empty reference without a flag stays unresolved and never gains invented text', () => {
  const parsed = parseManuscript(miniature('1:1\n1:2\nA sentence.'));
  assert.equal(parsed.references.length, 2);
  assert.equal(parsed.unresolvedReferences[0].canonicalId, 'inquiry:1:1');
  assert.equal(parsed.unresolvedReferences[0].editorialFlags.length, 0);
});

test('a thirty-flag input fails reconciliation even though it still has 31 empty references', () => {
  const changed = rawText.replace(/^\[\[FLAG: NO VERSE TEXT IN SOURCE[^\n]*\r?\n/m, '');
  const draft = makeDrafts(changed);
  assert.equal(draft.report.counts.unresolvedReferences, 31);
  assert.equal(draft.report.noTextFlagCount, 30);
  assert.equal(draft.report.status, 'INGESTION_FAILED');
  assert.equal(draft.report.reconciliationPassed, false);
  assert.ok(draft.report.errors.some((error) => error.message.includes('missing-text flag count')));
});

test('existing-reference checks cannot approve an incorrectly inferred anchor', () => {
  const changed = rawText.replace('[[Note 131 · 31:4 · PROBABLE ANCHOR', '[[Note 131 · 31:5 · PROBABLE ANCHOR');
  const draft = makeDrafts(changed);
  const note = draft.supporting.notes.find((entry) => entry.noteNumber === 131);
  assert.equal(note.anchor.referenceExists, true);
  assert.equal(note.anchor.status, 'inferred');
  assert.equal(note.anchor.reviewRequired, true);
  assert.ok(draft.report.errors.some((error) => error.message.includes('note 131 probable anchor')));
});

test('duplicate references, lost notes, broken index pairs and glossary omissions are detected', () => {
  const duplicate = makeDrafts(rawText.replace('\n1:2\n', '\n1:1\n'));
  assert.ok(duplicate.report.errors.some((error) => error.code === 'DUPLICATE_REFERENCE'));
  const lostNote = makeDrafts(rawText.replace(/\[\[Note 1 · 1:1\]\]\r?\n[^\n]*\r?\n/, ''));
  assert.ok(lostNote.report.errors.some((error) => error.message.includes('notes does not match')));
  const index = makeDrafts(rawText.replace('See also: 1:6', 'See also: 1:5'));
  assert.ok(index.report.errors.some((error) => error.code === 'INDEX_NOTE_MISMATCH'));
  const glossary = makeDrafts(rawText.replace('Abstinence\n', ''));
  assert.ok(glossary.report.errors.some((error) => error.code === 'MALFORMED_GLOSSARY_ENTRY'));
});

test('read-only CLI is independent of cwd and leaves all ten existing data files byte-identical', () => {
  const names = [...PROTECTED_FILES, 'canonical-content.draft.json', 'supporting-material.draft.json', 'ingestion-report.json'];
  const before = Object.fromEntries(names.map((name) => [name, sha256(fs.readFileSync(path.join(dataDir, name)))]));
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/parse-clean-manuscript.js'), '--check'], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.checkOnly, true);
  assert.equal(output.status, 'REVIEW_REQUIRED');
  assert.deepEqual(output.outputs, []);
  assert.equal(output.databaseModified, false);
  for (const name of names) assert.equal(sha256(fs.readFileSync(path.join(dataDir, name))), before[name], `File unchanged: ${name}`);
});

test('malformed boundaries and report conventions fail instead of silently dropping data', () => {
  assert.ok(parseManuscript('INQUIRY\nCHAPTER 1\n1:1\nText.').errors.some((error) => error.code === 'CANONICAL_BOUNDARIES'));
  assert.throws(() => readValidationReport(validationText.replace('## 1. Summary', '## Missing')), /section missing/);
  assert.throws(() => readValidationReport(validationText.replace('Verses with text', 'Unknown label')), /count missing/);
});
