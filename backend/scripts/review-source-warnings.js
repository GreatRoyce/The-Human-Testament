// Evidence collection only. This does not replace the ingestion parser, edit
// manuscript content, resolve editorial decisions, or access the database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pdf = require('pdf-parse/lib/pdf-parse.js');
const { readValidationReport, sha256 } = require('./ingestion/read-validation-report');
const { PROTECTED_FILES, OUTPUT_FILES } = require('./parse-clean-manuscript');
const dataDir = path.join(__dirname, '../data');
const output = path.join(__dirname, '../docs/SOURCE_WARNING_REVIEW.json');
const compact = value => value.replace(/\s/g, '');

function sourceLines(parts) {
  const lines = [];
  for (const part of parts) {
    const previous = lines.at(-1);
    if (previous && previous.page === part.page && Math.abs(previous.y - part.y) < 0.1) previous.text += part.text;
    else lines.push({ page: part.page, y: part.y, text: part.text });
  }
  return lines;
}

async function run() {
  const files = [...PROTECTED_FILES, ...Object.values(OUTPUT_FILES)];
  const manifest = files.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(dataDir, file))) }));
  const read = file => fs.readFileSync(path.join(dataDir, file), 'utf8');
  const canonical = JSON.parse(read(OUTPUT_FILES.canonical));
  const supporting = JSON.parse(read(OUTPUT_FILES.supporting));
  const report = JSON.parse(read(OUTPUT_FILES.report));
  const expected = readValidationReport(read('The-Human-Testament-Ingestion-Validation-Report.md'));
  assert.equal(report.status, 'REVIEW_REQUIRED');
  assert.equal(report.errors.length, 0);
  assert.equal(report.inputSha256, manifest.find(entry => entry.file === report.inputFile).sha256);
  assert.equal(report.validationReportSha256, expected.sha256);
  assert.equal(manifest.find(entry => entry.file.endsWith('--Complete-Manuscript.pdf')).sha256, expected.originalPdfSha256);
  const ranges = expected.books.map(book => ({ ...book, range: book.sourcePages.match(/\d+/g).map(Number) }));
  const references = new Map(), notes = new Map();
  let activeVerse, activeNote;
  const extractionErrors = [];
  const document = await pdf(fs.readFileSync(path.join(dataDir, 'The-Human-Testament--Complete-Manuscript.pdf')), {
    pagerender: async page => {
      // Inspection rules for this exact PDF: references 9pt, body 10pt,
      // notes 8pt, superscripts 5.8pt; running headers sit above y=600.
      // All extracted content is checked against the existing drafts below.
      try {
        const book = ranges.find(book => page.pageNumber >= book.range[0] && page.pageNumber <= book.range[1]);
        if (!book) return '';
        if (activeVerse?.bookSlug !== book.slug) activeVerse = null;
        const { items } = await page.getTextContent();
        for (const item of items) {
          const height = item.height, x = item.transform[4], y = item.transform[5], text = item.str;
          const reference = text.match(/^(\d+):(\d+)$/);
          if (reference && Math.abs(height - 9) < 0.1) {
            const id = `${book.slug}:${reference[1]}:${reference[2]}`;
            assert.ok(!references.has(id), `Duplicate PDF reference ${id}`);
            activeVerse = { id, bookSlug: book.slug, page: page.pageNumber, parts: [], markers: [] };
            references.set(id, activeVerse);
          } else if (Math.abs(height - 10) < 0.1 && y < 600 && activeVerse) {
            activeVerse.parts.push({ page: page.pageNumber, text, x, y });
          } else if (Math.abs(height - 5.8) < 0.1 && /^\d+$/.test(text)) {
            if (Math.abs(x - 51) < 2 || Math.abs(x - 229) < 2) {
              assert.ok(!notes.has(Number(text)), `Duplicate PDF note ${text}`);
              activeNote = { number: Number(text), parts: [] }; notes.set(Number(text), activeNote);
            } else if (activeVerse) activeVerse.markers.push(Number(text));
          } else if (Math.abs(height - 8) < 0.1 && y < 600 && activeNote) {
            activeNote.parts.push({ page: page.pageNumber, text, x, y });
          }
        }
        return '';
      } catch (error) { extractionErrors.push({ page: page.pageNumber, message: error.message }); throw error; }
    },
  });
  assert.deepEqual(extractionErrors, []); // pdf-parse otherwise swallows page extraction failures.
  assert.equal(references.size, report.counts.references);
  assert.equal(notes.size, report.counts.notes);
  const sourceText = entry => sourceLines(entry.parts).map(line => line.text).join('\n');
  const authored = canonical.books.flatMap(book => book.chapters.flatMap(chapter => chapter.verses.map(verse => ({
    id: `${book.slug}:${chapter.number}:${verse.number}`, ...verse,
  }))));
  for (const verse of authored) assert.equal(compact(sourceText(references.get(verse.id))), compact(verse.text), `PDF verse differs: ${verse.id}`);
  for (const note of supporting.notes) {
    assert.equal(compact(sourceText(notes.get(note.noteNumber))), compact(note.rawText), `PDF note differs: ${note.noteNumber}`);
    const markers = references.get(`${note.anchor.bookSlug}:${note.anchor.chapter}:${note.anchor.verse}`).markers;
    assert.equal(markers.includes(note.noteNumber), note.anchor.status === 'explicit', `PDF note anchor differs: ${note.noteNumber}`);
  }
  for (const ref of canonical.unresolvedReferences) {
    assert.equal(compact(sourceText(references.get(ref.canonicalId))), '', `Unexpected PDF verse text: ${ref.canonicalId}`);
    assert.equal(references.get(ref.canonicalId).page, ref.validationReport.sourcePage);
  }
  const noteEvidence = number => ({ noteNumber: number, lines: sourceLines(notes.get(number).parts) });
  const verseEvidence = id => ({ reference: id, referencePage: references.get(id).page, lines: sourceLines(references.get(id).parts) });
  const disposition = {
    MISSING_SOURCE_TEXT: 'The PDF reference is empty. Supplying text or declaring the omission intentional requires the author.',
    INFERRED_NOTE_ANCHOR: 'The note exists but no original marker confirms the probable anchor. Existing addresses and index corroboration do not establish intent.',
    INVALID_CROSS_REFERENCE_TARGET: 'The source citation is preserved and its target is absent. The manuscript does not identify an unambiguous replacement.',
    REPEATED_SOURCE_PASSAGE: 'Both passages occur in the original PDF. Removing or relocating either needs author confirmation.',
    LEGACY_BOOK_NAME: 'The legacy name occurs in the source itself. Rewriting prose requires an approved title and verse mapping.',
    PUNCTUATION_REVIEW: 'The punctuation is present in the PDF. Source preservation alone cannot establish whether it is intentional or erroneous.',
    INFERRED_SOURCE_LINE_JOIN: 'The PDF confirms the line break at the dash, but cannot establish the intended spacing. Keep the inference flagged.',
  };
  const entries = report.sourceIssues.map((issue, index) => {
    const detail = issue.detail;
    let evidence;
    switch (issue.code) {
      case 'MISSING_SOURCE_TEXT':
        evidence = { ...verseEvidence(detail.reference), authoredTextFound: false, probableNote: noteEvidence(detail.report.probableNoteNumber) };
        break;
      case 'INFERRED_NOTE_ANCHOR':
        evidence = { ...noteEvidence(detail.noteNumber), probableAnchor: verseEvidence(detail.anchor), originalMarkerFound: false };
        break;
      case 'INVALID_CROSS_REFERENCE_TARGET': {
        const prefix = `${detail.target.bookSlug}:${detail.target.chapter}:`;
        const chapterReferences = [...references.values()].filter(ref => ref.id.startsWith(prefix));
        evidence = { ...noteEvidence(detail.noteNumber), sourceCitation: detail.raw,
          targetChapterReferences: chapterReferences.map(ref => ref.id),
          targetChapterPages: [...new Set(chapterReferences.map(ref => ref.page))], targetExists: false };
        assert.ok(!references.has(`${prefix}${detail.target.verse}`));
        break;
      }
      case 'REPEATED_SOURCE_PASSAGE':
        evidence = { passages: detail.references.map(verseEvidence), equalIgnoringLayoutWhitespace: true };
        assert.equal(compact(sourceText(references.get(detail.references[0]))), compact(sourceText(references.get(detail.references[1]))));
        break;
      case 'LEGACY_BOOK_NAME':
        evidence = noteEvidence(detail.noteNumber);
        assert.match(compact(sourceText(notes.get(detail.noteNumber))), /(?:Seeker|Responsibility)\d+:\d+/);
        break;
      case 'PUNCTUATION_REVIEW':
        evidence = { reportObservations: detail.rawReportText, examples: ['inquiry:31:6', 'freedom:28:7', 'identity:7:1',
          'inquiry:32:3', 'inquiry:34:4', 'inquiry:39:13', 'freedom:34:2', 'society:41:12', 'identity:13:29', 'identity:14:29'].map(verseEvidence) };
        break;
      case 'INFERRED_SOURCE_LINE_JOIN': {
        const id = `${detail.bookSlug}:${detail.chapter}:${detail.verse}`, lines = verseEvidence(id).lines;
        const [left, right] = detail.joinedText.split('—').map(compact);
        const boundary = lines.findIndex((line, index) => index < lines.length - 1 &&
          ((compact(line.text).endsWith(left + '—') && compact(lines[index + 1].text).startsWith(right)) ||
           (compact(line.text).endsWith(left) && compact(lines[index + 1].text).startsWith('—' + right))));
        assert.ok(boundary >= 0, `Cannot locate source dash boundary: ${id} ${detail.joinedText}`);
        evidence = { reference: id, inferredJoin: detail.joinedText, sourceBoundary: lines.slice(boundary, boundary + 2), spacingResolved: false };
        break;
      }
      default: throw new Error(`Unreviewed warning category: ${issue.code}`);
    }
    return { id: `source-warning-${String(index + 1).padStart(3, '0')}`, code: issue.code,
      finding: issue, evidence, evidenceReviewed: true, editorialDecision: 'PENDING_AUTHOR_REVIEW',
      correctionApplied: false, reason: disposition[issue.code] };
  });
  const review = {
    reviewedAt: new Date().toISOString(), status: 'SOURCE_REVIEW_OPEN', importApproved: false, correctionsApplied: 0,
    method: 'Original PDF character layer inspected using the existing pdf-parse dependency and this PDF layout. Verse and note characters compared after removing whitespace; no page-image review or independent second-extractor token comparison performed.',
    limitations: ['Whitespace normalization cannot resolve the 49 inferred dash spacings.', 'Matching source characters does not certify editorial correctness, intended anchors, intended references, or truth of manuscript statements.'],
    sourceManifest: manifest, checks: { pdfPages: document.numpages, references: references.size, authoredVersesCompared: authored.length,
      notesCompared: supporting.notes.length, warningRecordsReviewed: entries.length,
      originalFootnoteMarkers: [...references.values()].reduce((total, ref) => total + ref.markers.length, 0) },
    categories: Object.fromEntries(Object.entries(disposition).map(([code, reason]) => [code, {
      count: entries.filter(entry => entry.code === code).length, disposition: reason,
    }])), entries,
  };
  assert.equal(review.checks.originalFootnoteMarkers, report.counts.explicitAnchors);
  for (const entry of manifest) assert.equal(sha256(fs.readFileSync(path.join(dataDir, entry.file))), entry.sha256, `Input changed during review: ${entry.file}`);
  // Regenerable evidence packet only; approved editorial decisions belong elsewhere.
  fs.writeFileSync(output, JSON.stringify(review, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ status: review.status, checks: review.checks, correctionsApplied: 0,
    importApproved: false, dataFilesUnchanged: manifest.length, output: 'docs/SOURCE_WARNING_REVIEW.json' }, null, 2));
}

if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { run };
