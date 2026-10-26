const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compareDraftContent, matchesDraftArtifact } = require('../scripts/verify-content-fidelity');
const { fixture, text } = require('../test-fixtures/canonical');
const Verse = require('../src/models/Verse');
const Note = require('../src/models/Note');
const Book = require('../src/models/Book');
const Edition = require('../src/models/Edition');
const { isEditionApproved } = require('../src/services/contentApproval');
const { spawnSync } = require('node:child_process');
const { sha256 } = require('../scripts/ingestion/read-validation-report');
const { comparePdfText } = require('../scripts/ingestion/compare-pdf-supporting');

test('PDF supporting comparison detects punctuation and Unicode changes while explicitly excluding layout whitespace', () => {
  const source = '“Inquiry”—isn’t a final answer.\nSecond paragraph.';
  assert.equal(comparePdfText(source, source), true);
  assert.equal(comparePdfText(source, source.replace('“', '"')), false);
  assert.equal(comparePdfText(source, source.replace('—', '-')), false);
  assert.equal(comparePdfText(source, source.replace('isn’t', "isn't")), false);
  assert.equal(comparePdfText(source, source.replace('answer.', 'answer')), false);
  assert.equal(comparePdfText(source, source.replace('\n', '  ')), true);
  assert.equal(comparePdfText('Inquiry........6', 'Inquiry\t6', { contentsLeaders: true }), true);
  assert.equal(comparePdfText('Inquiry........6', 'Inquiry\t7', { contentsLeaders: true }), false);
  assert.equal(comparePdfText('Inquiry........6', 'Inquiry\t6'), false);
});

test('models preserve decoded strings exactly, including surrounding spaces and paragraph boundaries', async () => {
  const value = fixture();
  const verse = new Verse(value.verses[0]); await verse.validate(); assert.equal(verse.text, text);
  const note = new Note(value.notes[0]); await note.validate(); assert.equal(note.text, value.notes[0].text); assert.equal(note.rawText, value.notes[0].rawText);
  const book = new Book(value.books[0]); await book.validate(); assert.equal(book.title, value.books[0].title);
  assert.equal(JSON.parse(JSON.stringify(verse)).text, text);
});

test('repeated import write attempts fail before loading database code and preserve all source artifacts', () => {
  const dataDir = path.join(__dirname, '../data');
  const hashes = Object.fromEntries(fs.readdirSync(dataDir).map(file => [file, sha256(fs.readFileSync(path.join(dataDir, file)))]));
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/import-canonical.js'), '--write'], {
      encoding: 'utf8', env: { ...process.env, MONGODB_URI: 'mongodb://secret-user:secret-password@invalid.example/test' },
    });
    assert.equal(result.status, 1); assert.match(result.stderr, /writes remain disabled/);
    assert.ok(!result.stderr.includes('secret-password'));
  }
  for (const [file, hash] of Object.entries(hashes)) assert.equal(sha256(fs.readFileSync(path.join(dataDir, file))), hash);
});

test('models reject editorial verse text, wrong stable identities, invented unresolved text, and implicit string casting', async () => {
  const verse = fixture().verses[0];
  for (const invalid of [{ ...verse, text: '[[FLAG: NO VERSE TEXT IN SOURCE]]' }, { ...verse, text: 123 },
    { ...verse, canonicalId: 'fixture:1:2' }, { ...verse, status: 'missing_source_text', text: 'invented' }]) {
    await assert.rejects(new Verse(invalid).validate());
  }
  const missing = new Verse(fixture().verses[2]); await missing.validate(); assert.equal(missing.text, undefined);
});

test('inferred anchors cannot be stored as confirmed source markers', async () => {
  const note = fixture().notes[3];
  await new Note(note).validate();
  await assert.rejects(new Note({ ...note, anchor: { ...note.anchor, sourceMarkerPresent: true } }).validate());
  await assert.rejects(new Note({ ...note, anchor: { ...note.anchor, reviewRequired: false } }).validate());
});

test('publication requires explicit edition approval, manifest, fidelity checks, and review of every issue', async () => {
  const edition = fixture().edition;
  assert.equal(isEditionApproved(edition), true);
  await new Edition(edition).validate();
  for (const invalid of [{ ...edition, approvalStatus: 'DRAFT_REVIEW_REQUIRED' }, { ...edition, sourceManifest: [] },
    { ...edition, validation: { structuralPassed: true, textFidelityPassed: false } },
    { ...edition, approval: { ...edition.approval, issueDecisions: [] } },
    { ...edition, approval: { ...edition.approval, issueDecisions: [edition.approval.issueDecisions[0], edition.approval.issueDecisions[0]] } }]) {
    assert.equal(isEditionApproved(invalid), false); await assert.rejects(new Edition(invalid).validate());
  }
});

test('full draft comparison detects a one-character text change, lost supporting material, and changed anchor uncertainty', () => {
  const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../data', name)));
  const expected = { canonical: read('canonical-content.draft.json'), supporting: read('supporting-material.draft.json') };
  assert.ok(compareDraftContent(expected, expected).every(check => check.passed));
  for (const change of [value => { value.canonical.books[0].chapters[0].verses[0].text += '.'; },
    value => { value.supporting.notes[0].text = value.supporting.notes[0].text.replace('.', '—'); },
    value => { value.supporting.glossary.pop(); }, value => { value.supporting.crossReferenceIndex.pop(); },
    value => { value.supporting.notes.find(note => note.inferredAnchor).anchor.status = 'explicit'; },
    value => { value.canonical.books[0].chapters[0].verses[0].text += '\n'; }]) {
    const actual = structuredClone(expected); change(actual);
    assert.ok(compareDraftContent(actual, expected).some(check => !check.passed));
  }
});

test('complete artifact verification detects changed source hashes, edition metadata and hidden review findings', () => {
  const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../data', name)));
  for (const [kind, name] of [['canonical', 'canonical-content.draft.json'], ['supporting', 'supporting-material.draft.json'], ['report', 'ingestion-report.json']]) {
    const expected = read(name);
    assert.equal(matchesDraftArtifact(expected, expected, kind), true);
    for (const change of [value => { value.sourceManifest[0].sha256 = '0'.repeat(64); },
      value => { value.sourceVersion = 'unreviewed-edition'; }, value => { value.approvalStatus = 'APPROVED'; }]) {
      const actual = structuredClone(expected); change(actual);
      assert.equal(matchesDraftArtifact(actual, expected, kind), false);
    }
    if (kind === 'report') {
      const actual = structuredClone(expected); actual.sourceIssues.pop();
      assert.equal(matchesDraftArtifact(actual, expected, kind), false);
    }
  }
});
